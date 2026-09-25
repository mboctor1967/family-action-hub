import { db } from '@/lib/db'
import { gmailAccounts, emailsScanned, tasks, topics, scanRuns } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { fetchEmails, fetchUnscannedEmails, preFilterEmails } from '@/lib/gmail/client'
import { classifyEmails, type EmailInput } from '@/lib/ai/classify'
import { buildClassificationPrompt } from '@/lib/ai/build-prompt'
import { classifyScanError } from '@/lib/scan/scan-errors'

/** Progress events — same shape as the SSE `send('progress', ...)` / `send('done', ...)` payloads */
export type ScanProgressEvent =
  | { event: 'progress'; data: { step: number; total: number; label: string; percent: number } }
  | { event: 'done'; data: { scanRunId: string; emailsScanned: number; actionable?: number; informational?: number; noise?: number; newEmails?: number; alreadyScanned?: number; message?: string } }
  | { event: 'error'; data: { error: string } }

export type ScanResult = {
  scanRunId: string
  actionable: number
  informational: number
  noise: number
  skipped: number
  /** Total emails Gmail returned for the scan window (new + already-scanned). */
  totalEmails: number
  /** Emails not previously seen by this account — the set that went to classification. */
  newEmails: number
  /** Emails already present in `emails_scanned` for this account, excluded from re-classification. */
  alreadyScanned: number
  /** Start of the scan window (inclusive), UTC. */
  windowFrom: Date
  /** End of the scan window (= scan start time), UTC. */
  windowTo: Date
  /** Unscanned emails left in the window after this run's batch (0 = window fully covered). */
  remaining?: number
}

export type RunScanOptions = {
  onProgress?: (event: ScanProgressEvent) => void
  scanWindow?: '24h' | '7d' | '30d'
  forceRescan?: boolean
  maxEmails?: number
  /** Explicit date range (backfill). Overrides `scanWindow`. */
  range?: { from: Date; to: Date }
  /** When running from cron, pass userId so we can look up the account */
  userId?: string
}

type SendFn = (event: 'progress' | 'done' | 'error', data: Record<string, unknown>) => void

type AccountRow = typeof gmailAccounts.$inferSelect

export async function runScanForAccount(
  gmailAccountId: string,
  opts: RunScanOptions = {},
): Promise<ScanResult> {
  const { onProgress = () => {} } = opts

  function send(event: 'progress' | 'done' | 'error', data: Record<string, unknown>) {
    onProgress({ event, data } as ScanProgressEvent)
  }

  // Step 1: Connect
  send('progress', { step: 1, total: 5, label: 'Connecting to Gmail...', percent: 5 })

  const results = await db.select().from(gmailAccounts).where(eq(gmailAccounts.id, gmailAccountId)).limit(1)
  const account = results[0]

  if (!account) {
    send('error', { error: 'No Gmail account connected. Go to Settings to connect.' })
    throw new Error('No Gmail account found for id: ' + gmailAccountId)
  }

  const [scanRun] = await db.insert(scanRuns).values({
    gmailAccountId: account.id,
    status: 'running',
  }).returning()

  // Every exit below is recorded. A run must never be left at 'running' — that is
  // precisely how 159 consecutive failures went unnoticed between 2026-05 and 2026-08.
  try {
    const result = await executeScan(account, scanRun.id, opts, send)
    // A backfill proves Gmail works but is not the daily scan; advancing lastScanAt
    // from it would mask a broken cron in Settings.
    if (!opts.range) await markScanSuccess(account.id)
    return result
  } catch (err) {
    await markScanFailure(account.id, scanRun.id, err, send)
    throw err
  }
}

/** Clears the error fields and advances the last-successful-scan marker. */
async function markScanSuccess(accountId: string): Promise<void> {
  await db.update(gmailAccounts).set({
    lastScanAt: new Date(),
    lastError: null,
    lastErrorCode: null,
    lastErrorAt: null,
  }).where(eq(gmailAccounts.id, accountId))
}

/**
 * Records the failure on both the run and the account, then leaves rethrowing to
 * the caller. Best-effort: if the database write itself fails we must not mask the
 * original error, which is the more useful one.
 */
async function markScanFailure(
  accountId: string,
  scanRunId: string,
  err: unknown,
  send: SendFn,
): Promise<void> {
  const classified = classifyScanError(err)
  const now = new Date()

  try {
    await db.update(scanRuns).set({
      status: 'failed',
      completedAt: now,
      errorMessage: classified.message,
    }).where(eq(scanRuns.id, scanRunId))

    await db.update(gmailAccounts).set({
      lastError: classified.message,
      lastErrorCode: classified.code,
      lastErrorAt: now,
    }).where(eq(gmailAccounts.id, accountId))
  } catch (recordErr) {
    console.error('[run-scan] failed to record scan failure', recordErr)
  }

  console.error(`[run-scan] scan failed for account ${accountId} (${classified.code}): ${classified.message}`)
  send('error', { error: classified.message })
}

async function executeScan(
  account: AccountRow,
  scanRunId: string,
  opts: RunScanOptions,
  send: SendFn,
): Promise<ScanResult> {
  const {
    scanWindow = '7d',
    forceRescan = false,
    maxEmails = 100,
  } = opts

  // Step 2: Fetch emails
  send('progress', { step: 2, total: 5, label: 'Fetching emails from Gmail...', percent: 15 })

  const windowDays = scanWindow === '24h' ? 1 : scanWindow === '7d' ? 7 : scanWindow === '30d' ? 30 : 7
  const windowTo = opts.range?.to ?? new Date()
  const afterDate = opts.range?.from ?? new Date(new Date(windowTo).setDate(windowTo.getDate() - windowDays))
  const query = opts.range
    ? `after:${Math.floor(afterDate.getTime() / 1000)} before:${Math.floor(windowTo.getTime() / 1000)}`
    : `after:${afterDate.getFullYear()}/${afterDate.getMonth() + 1}/${afterDate.getDate()}`

  const token = {
    accessToken: account.accessToken!,
    refreshToken: account.refreshToken,
    tokenExpiry: account.tokenExpiry,
  }

  let allEmails: Awaited<ReturnType<typeof fetchEmails>>['emails']
  let newEmails: typeof allEmails
  let newAccessToken: string | undefined
  let totalInWindow: number
  let skipped: number
  let remaining = 0

  if (!forceRescan) {
    // Unscanned-first: known ids are dropped before the cap, oldest first, so a
    // backlog larger than maxEmails is worked through across runs instead of the
    // same newest 100 being re-fetched forever. AC-010, AC-011.
    const r = await fetchUnscannedEmails(token, query, {
      maxEmails,
      filterKnown: (ids) => knownMessageIds(account.id, ids),
    })
    allEmails = r.emails
    newEmails = r.emails
    newAccessToken = r.newAccessToken
    totalInWindow = r.totalInWindow
    skipped = r.alreadyScanned
    remaining = r.remaining
  } else {
    const r = await fetchEmails(token, query, maxEmails)
    allEmails = r.emails
    newEmails = r.emails
    newAccessToken = r.newAccessToken
    totalInWindow = r.emails.length
    skipped = 0
    const messageIds = allEmails.map(e => e.messageId)
    if (messageIds.length > 0) {
      const existingScanned = await db.select({ id: emailsScanned.id })
        .from(emailsScanned)
        .where(and(
          eq(emailsScanned.gmailAccountId, account.id),
          inArray(emailsScanned.messageId, messageIds),
        ))
      const scannedIds = existingScanned.map(e => e.id)
      if (scannedIds.length > 0) {
        await db.delete(tasks).where(inArray(tasks.sourceEmailId, scannedIds))
        await db.delete(emailsScanned).where(inArray(emailsScanned.id, scannedIds))
      }
    }
  }

  if (newAccessToken) {
    await db.update(gmailAccounts).set({
      accessToken: newAccessToken,
      tokenExpiry: new Date(Date.now() + 3600 * 1000),
    }).where(eq(gmailAccounts.id, account.id))
  }

  send('progress', { step: 2, total: 5, label: `Found ${totalInWindow} emails`, percent: 30 })


  if (newEmails.length === 0) {
    await db.update(scanRuns).set({
      completedAt: new Date(),
      emailsScanned: 0,
      status: 'completed',
    }).where(eq(scanRuns.id, scanRunId))

    send('done', {
      scanRunId,
      emailsScanned: 0,
      newEmails: 0,
      alreadyScanned: skipped,
      message: totalInWindow > 0
        ? `All ${totalInWindow} emails in this window were already scanned. New emails will appear when they arrive.`
        : 'No emails found in this time window.',
    })

    return {
      scanRunId,
      actionable: 0,
      informational: 0,
      noise: 0,
      skipped,
      totalEmails: totalInWindow,
      newEmails: 0,
      alreadyScanned: skipped,
      windowFrom: afterDate,
      windowTo,
      remaining: 0,
    }
  }

  // Pre-filter noise
  const filtered = preFilterEmails(newEmails)
  const noiseCount = newEmails.length - filtered.length

  send('progress', { step: 3, total: 5, label: `${newEmails.length} new emails, ${noiseCount} pre-filtered as noise, ${filtered.length} to classify`, percent: 40 })

  // Store noise emails
  const noiseEmails = newEmails.filter(e => !filtered.includes(e))
  if (noiseEmails.length > 0) {
    await db.insert(emailsScanned).values(
      noiseEmails.map(e => ({
        gmailAccountId: account.id,
        messageId: e.messageId,
        threadId: e.threadId,
        fromAddress: e.fromAddress,
        fromName: e.fromName,
        subject: e.subject,
        date: e.date ? new Date(e.date) : new Date(),
        classification: 'noise' as const,
        confidenceScore: 1.0,
        aiSummary: 'Pre-filtered as promotional/social',
        rawSnippet: e.snippet,
        gmailLabels: e.labels,
      })),
    )
  }

  // Step 4: AI classification
  send('progress', { step: 4, total: 5, label: `Classifying ${filtered.length} emails with AI...`, percent: 50 })

  const skillPrompt = buildClassificationPrompt()
  const topicResults = await db.select({ name: topics.name }).from(topics)
  const topicNames = topicResults.map(t => t.name)

  const emailInputs: EmailInput[] = filtered.map(e => ({
    messageId: e.messageId,
    from: e.from,
    fromAddress: e.fromAddress,
    subject: e.subject,
    date: e.date,
    snippet: e.snippet,
    body: e.body,
  }))

  const classifications = await classifyEmails(emailInputs, skillPrompt, topicNames)

  send('progress', { step: 5, total: 5, label: 'Saving results...', percent: 80 })

  // Step 5: Store results
  let actionableCount = 0
  let informationalCount = 0

  for (const classification of classifications) {
    const email = filtered.find(e => e.messageId === classification.messageId)
    if (!email) continue

    const isActionable = classification.classification === 'actionable'

    await db.insert(emailsScanned).values({
      gmailAccountId: account.id,
      messageId: email.messageId,
      threadId: email.threadId,
      fromAddress: email.fromAddress,
      fromName: email.fromName,
      subject: email.subject,
      date: email.date ? new Date(email.date) : new Date(),
      classification: classification.classification,
      confidenceScore: classification.confidence,
      aiSummary: classification.action_summary || classification.reasoning,
      rawSnippet: email.snippet,
      gmailLabels: email.labels,
      triageStatus: isActionable ? 'unreviewed' : null,
      aiSuggestions: isActionable ? JSON.stringify({
        urgency: classification.urgency || 'medium',
        suggested_assignee: classification.suggested_assignee,
        suggested_topic: classification.suggested_topic,
        due_date: classification.due_date,
        action_summary: classification.action_summary,
      }) : null,
    })

    if (isActionable) {
      actionableCount++
    } else if (classification.classification === 'informational') {
      informationalCount++
    }
  }

  const aiNoiseCount = classifications.filter(c => c.classification === 'noise').length

  await db.update(scanRuns).set({
    completedAt: new Date(),
    emailsScanned: newEmails.length,
    actionableCount,
    informationalCount,
    noiseCount: noiseCount + aiNoiseCount,
    status: 'completed',
  }).where(eq(scanRuns.id, scanRunId))

  send('done', {
    scanRunId,
    emailsScanned: newEmails.length,
    actionable: actionableCount,
    informational: informationalCount,
    noise: noiseCount + aiNoiseCount,
  })

  return {
    scanRunId,
    actionable: actionableCount,
    informational: informationalCount,
    noise: noiseCount + aiNoiseCount,
    skipped,
    totalEmails: totalInWindow,
    newEmails: newEmails.length,
    alreadyScanned: skipped,
    windowFrom: afterDate,
    windowTo,
    remaining,
  }
}

/** Which of `ids` this account has already scanned. */
async function knownMessageIds(accountId: string, ids: string[]): Promise<Set<string>> {
  const rows = await db.select({ messageId: emailsScanned.messageId })
    .from(emailsScanned)
    .where(and(eq(emailsScanned.gmailAccountId, accountId), inArray(emailsScanned.messageId, ids)))
  return new Set(rows.map((e) => e.messageId))
}

/**
 * How many emails in `range` this account has not scanned yet. Reads Gmail ids
 * only — nothing is fetched in full or classified, so it costs nothing.
 */
export async function countUnscanned(
  gmailAccountId: string,
  range: { from: Date; to: Date },
): Promise<{ totalInWindow: number; unscanned: number }> {
  const [account] = await db.select().from(gmailAccounts).where(eq(gmailAccounts.id, gmailAccountId)).limit(1)
  if (!account) throw new Error('No Gmail account found for id: ' + gmailAccountId)

  const query = `after:${Math.floor(range.from.getTime() / 1000)} before:${Math.floor(range.to.getTime() / 1000)}`
  const r = await fetchUnscannedEmails(
    { accessToken: account.accessToken!, refreshToken: account.refreshToken, tokenExpiry: account.tokenExpiry },
    query,
    { maxEmails: 0, filterKnown: (ids) => knownMessageIds(account.id, ids) },
  )
  if (r.newAccessToken) {
    await db.update(gmailAccounts).set({
      accessToken: r.newAccessToken,
      tokenExpiry: new Date(Date.now() + 3600 * 1000),
    }).where(eq(gmailAccounts.id, account.id))
  }
  return { totalInWindow: r.totalInWindow, unscanned: r.remaining }
}
