import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emailsScanned, gmailAccounts } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { runScanForAccount, type ScanResult } from '@/lib/scan/run-scan'
import { scoreEmail } from '@/lib/scan/priority-score'
import { sendDigest } from '@/lib/whatsapp/digest-sender'
import { sendOpsAlert, type ScanFailureReport } from '@/lib/whatsapp/ops-alert'
import { classifyScanError } from '@/lib/scan/scan-errors'
import type { DigestStats } from '@/lib/whatsapp/digest-format'
import { APP_LOCALE, APP_TIMEZONE } from '@/lib/constants'

// The scan runs inline in this request: a recovery run after an outage fetches up
// to 100 emails and classifies them in batches. Without this the first successful
// run after a long gap is the one most likely to be cut off. See DEC-5 / AC-013.
export const maxDuration = 300

// Vercel Cron invokes scheduled paths via GET, injecting `Authorization: Bearer $CRON_SECRET`.
// The WhatsApp "scan" command also hits this endpoint with the same auth header — see webhook/route.ts.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Recipients come from the WhatsApp allowlist (E.164 format, including +).
  const rawRecipients = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (rawRecipients.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, skipped: 1, reason: 'no recipients' })
  }

  // Run one fresh scan per Gmail account (recipients share the scanned mailbox).
  const accounts = await db.select().from(gmailAccounts)
  const scanResults: ScanResult[] = []
  const failures: ScanFailureReport[] = []
  for (const account of accounts) {
    try {
      const result = await runScanForAccount(account.id)
      scanResults.push(result)
    } catch (err) {
      const classified = classifyScanError(err)
      console.error(`[cron/digest] scan failed for account ${account.id} (${classified.code})`, err)
      failures.push({
        email: account.email,
        errorCode: classified.code,
        errorMessage: classified.message,
        // Read before the scan wrote its error fields, so this is the genuine
        // last-success timestamp rather than this run's failure time.
        lastSuccessfulScan: account.lastScanAt,
      })
    }
  }
  const scanErrors = failures.length

  // A failed scan must never produce a normal-looking digest. For four months the
  // digest kept arriving off four-month-old data, which is precisely why nobody
  // noticed the scan was dead: an empty digest is indistinguishable from a quiet
  // inbox. When nothing scanned, send nothing and tell the operator instead.
  const allAccountsFailed = accounts.length > 0 && scanResults.length === 0

  if (failures.length > 0) {
    await sendOpsAlert(failures)
  }

  if (allAccountsFailed) {
    return NextResponse.json({
      sent: 0,
      failed: 0,
      skipped: 0,
      scanErrors,
      suppressed: true,
      reason: 'scan failed for every account — digest suppressed',
    })
  }

  // Fetch actionable + unreviewed emails across all accounts.
  const items = await db
    .select({
      id: emailsScanned.id,
      messageId: emailsScanned.messageId,
      subject: emailsScanned.subject,
      fromName: emailsScanned.fromName,
      fromAddress: emailsScanned.fromAddress,
      date: emailsScanned.date,
      rawSnippet: emailsScanned.rawSnippet,
    })
    .from(emailsScanned)
    .where(
      and(
        eq(emailsScanned.classification, 'actionable'),
        eq(emailsScanned.triageStatus, 'unreviewed'),
      ),
    )

  const scored = items
    .map((e) => ({
      item: e,
      score: scoreEmail({ date: e.date, subject: e.subject, rawSnippet: e.rawSnippet }),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const ad = a.item.date?.getTime() ?? 0
      const bd = b.item.date?.getTime() ?? 0
      return bd - ad
    })

  const dateFmt = new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
  const shortFmt = new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: '2-digit',
  })
  const dateLabel = dateFmt.format(new Date())

  // Aggregate counts across the accounts that scanned successfully. The
  // every-account-failed case has already returned above, so reaching here means
  // at least one scan succeeded; `scanFailed` now denotes a PARTIAL failure.
  const totalEmails = scanResults.reduce((s, r) => s + r.totalEmails, 0)
  const newEmails = scanResults.reduce((s, r) => s + r.newEmails, 0)
  const alreadyScanned = scanResults.reduce((s, r) => s + r.alreadyScanned, 0)
  const earliestFrom = scanResults.reduce<Date | null>(
    (acc, r) => (acc === null || r.windowFrom < acc ? r.windowFrom : acc),
    null,
  )
  const latestTo = scanResults.reduce<Date | null>(
    (acc, r) => (acc === null || r.windowTo > acc ? r.windowTo : acc),
    null,
  )
  // Fallback window when no scan succeeded: same 7d default as runScanForAccount.
  const fallbackTo = new Date()
  const fallbackFrom = new Date(fallbackTo)
  fallbackFrom.setDate(fallbackFrom.getDate() - 7)

  const stats: DigestStats = {
    windowFromLabel: shortFmt.format(earliestFrom ?? fallbackFrom),
    windowToLabel: shortFmt.format(latestTo ?? fallbackTo),
    totalEmails,
    newEmails,
    alreadyScanned,
    actionableCount: scored.length,
    scanFailed: failures.length > 0,
  }

  let sent = 0
  let failed = 0
  for (const recipient of rawRecipients) {
    try {
      await sendDigest({
        recipient,
        items: scored.map((s) => ({
          id: s.item.id,
          subject: s.item.subject,
          fromName: s.item.fromName,
          fromAddress: s.item.fromAddress,
          gmailMessageId: s.item.messageId,
          date: s.item.date,
        })),
        dateLabel,
        stats,
      })
      sent++
    } catch (err) {
      console.error('[cron/digest] send failed for', recipient, err)
      failed++
    }
  }

  return NextResponse.json({ sent, failed, skipped: 0, scanErrors, suppressed: false })
}
