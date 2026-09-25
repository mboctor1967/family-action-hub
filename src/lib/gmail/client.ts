import { google } from 'googleapis'

interface TokenInfo {
  accessToken: string
  refreshToken?: string | null
  tokenExpiry?: Date | null
}

/**
 * Creates a Gmail client with automatic token refresh.
 * Returns the client and a potentially refreshed access token.
 */
export async function createGmailClient(token: TokenInfo, forceRefresh = false): Promise<{
  gmail: ReturnType<typeof google.gmail>
  newAccessToken?: string
}> {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  oauth2.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken || undefined,
  })

  // Check if token is expired or about to expire (within 5 minutes).
  // NOTE: this clock check alone is not sufficient — Google can invalidate a token
  // out-of-band (secret rotated, grant revoked) while it still looks fresh here.
  // `fetchEmails` therefore also refreshes reactively on a 401. See AC-006.
  const isExpired = token.tokenExpiry && new Date(token.tokenExpiry).getTime() < Date.now() + 5 * 60 * 1000
  let newAccessToken: string | undefined

  if ((forceRefresh || isExpired) && token.refreshToken) {
    try {
      const { credentials } = await oauth2.refreshAccessToken()
      oauth2.setCredentials(credentials)
      newAccessToken = credentials.access_token || undefined
    } catch (err) {
      // Rethrow the ORIGINAL error. It carries response.data.error
      // (invalid_client / invalid_grant), which the scan error taxonomy needs to
      // tell the operator which remedy actually applies. Replacing it with a
      // generic "please reconnect" message sent the operator down a dead end for
      // four months in 2026.
      // Summary only: the raw gaxios error carries the refresh token and client
      // secret in its request config, and was landing verbatim in Vercel logs. AC-006.
      console.error('Failed to refresh Gmail token:', describeErrorForLog(err))
      throw err
    }
  }

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2 }),
    newAccessToken,
  }
}

/** True for an auth rejection that a fresh access token might resolve. */
function isUnauthorized(err: unknown): boolean {
  const e = (err ?? {}) as { response?: { status?: number }; status?: number }
  return (e.response?.status ?? e.status) === 401
}

/**
 * A log-safe one-liner for a googleapis/gaxios error: name, message, HTTP status and
 * OAuth error code — never the request config, which holds tokens and secrets.
 */
export function describeErrorForLog(err: unknown): string {
  if (!(err instanceof Error)) return typeof err === 'string' ? err : 'non-Error thrown'
  const e = err as Error & { response?: { status?: number; data?: { error?: unknown } }; code?: unknown }
  const parts = [`${e.name}: ${e.message}`]
  if (e.response?.status) parts.push(`status ${e.response.status}`)
  if (typeof e.response?.data?.error === 'string') parts.push(`oauth ${e.response.data.error}`)
  if (typeof e.code === 'string' || typeof e.code === 'number') parts.push(`code ${e.code}`)
  return parts.join(' · ')
}

export interface EmailMetadata {
  messageId: string
  threadId: string
  from: string
  fromAddress: string
  fromName: string
  to: string
  subject: string
  date: string
  snippet: string
  body: string
  labels: string[]
}

export async function fetchEmails(
  token: TokenInfo,
  query: string,
  maxResults: number = 50
): Promise<{ emails: EmailMetadata[]; newAccessToken?: string }> {
  let { gmail, newAccessToken } = await createGmailClient(token)

  const listMessages = () =>
    gmail.users.messages.list({ userId: 'me', q: query, maxResults })

  let listResponse
  try {
    listResponse = await listMessages()
  } catch (err) {
    // Reactive refresh: the token passed the clock check but Google rejected it.
    // Exactly one retry — a second 401 means the credential is genuinely dead and
    // must surface rather than loop.
    if (!isUnauthorized(err) || !token.refreshToken) throw err

    const refreshed = await createGmailClient(token, true)
    gmail = refreshed.gmail
    newAccessToken = refreshed.newAccessToken ?? newAccessToken
    listResponse = await listMessages()
  }

  const messages = listResponse.data.messages || []

  // Fetch in parallel batches of 20 for speed
  const emailDetails: EmailMetadata[] = []
  const batchSize = 20
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map((msg) => fetchSingleEmail(gmail, msg.id!))
    )
    emailDetails.push(...batchResults)
  }

  return { emails: emailDetails, newAccessToken }
}

async function fetchSingleEmail(gmail: any, messageId: string): Promise<EmailMetadata> {
  const detail = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })

  const headers = detail.data.payload?.headers || []
  const getHeader = (name: string) =>
    headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

  // Extract body text
  let body = ''
  const payload = detail.data.payload
  if (payload?.body?.data) {
    body = Buffer.from(payload.body.data, 'base64').toString('utf-8')
  } else if (payload?.parts) {
    const textPart = payload.parts.find(
      (p: any) => p.mimeType === 'text/plain'
    )
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
    } else {
      const htmlPart = payload.parts.find(
        (p: any) => p.mimeType === 'text/html'
      )
      if (htmlPart?.body?.data) {
        body = Buffer.from(htmlPart.body.data, 'base64').toString('utf-8')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }
    }
  }

  const fromHeader = getHeader('From')
  return {
    messageId: detail.data.id!,
    threadId: detail.data.threadId || '',
    from: fromHeader,
    fromAddress: fromHeader.match(/<(.+)>/)?.[1] || fromHeader,
    fromName: fromHeader.replace(/<.+>/, '').replace(/"/g, '').trim(),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    snippet: detail.data.snippet || '',
    body: body.substring(0, 3000),
    labels: detail.data.labelIds || [],
  }
}

// Pre-filter: skip known noise categories
const NOISE_LABELS = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'SPAM', 'TRASH']

export function preFilterEmails(emails: EmailMetadata[]) {
  return emails.filter((email) => {
    const hasOnlyNoiseLabels = email.labels.every(
      (l) => NOISE_LABELS.includes(l) || l === 'UNREAD'
    )
    if (hasOnlyNoiseLabels && email.labels.some((l) => NOISE_LABELS.includes(l))) {
      return false
    }
    return true
  })
}

/** Hard ceiling on ids listed per scan; a 30-day window of this mailbox is ~1,800. */
export const LIST_CAP = 2000

/**
 * Pure selection step of the unscanned-first scan. `ids` is Gmail order (newest
 * first). Known ids are removed BEFORE the cap is applied — the old scan capped
 * first, so once more than `max` emails arrived during an outage, the older ones
 * were never reached. The oldest unscanned go first so a gap closes in order.
 */
export function selectUnscanned(ids: string[], known: Set<string>, max: number) {
  const unscanned = ids.filter((id) => !known.has(id)).reverse()
  const batch = unscanned.slice(0, max)
  return {
    batch,
    unscannedCount: unscanned.length,
    alreadyScanned: ids.length - unscanned.length,
    remaining: unscanned.length - batch.length,
  }
}

export async function fetchUnscannedEmails(
  token: TokenInfo,
  query: string,
  opts: { maxEmails: number; filterKnown: (ids: string[]) => Promise<Set<string>>; listCap?: number },
): Promise<{ emails: EmailMetadata[]; totalInWindow: number; alreadyScanned: number; remaining: number; newAccessToken?: string }> {
  let { gmail, newAccessToken } = await createGmailClient(token)
  const cap = opts.listCap ?? LIST_CAP

  const listAll = async () => {
    const ids: string[] = []
    let pageToken: string | undefined
    do {
      const res = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: Math.min(500, cap - ids.length),
        pageToken,
      })
      ids.push(...(res.data.messages ?? []).map((m) => m.id!).filter(Boolean))
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken && ids.length < cap)
    return ids
  }

  let ids: string[]
  try {
    ids = await listAll()
  } catch (err) {
    // Same single reactive refresh as fetchEmails: a token can look fresh by the
    // clock yet be rejected. A second 401 surfaces.
    if (!isUnauthorized(err) || !token.refreshToken) throw err
    const refreshed = await createGmailClient(token, true)
    gmail = refreshed.gmail
    newAccessToken = refreshed.newAccessToken ?? newAccessToken
    ids = await listAll()
  }

  const known = ids.length > 0 ? await opts.filterKnown(ids) : new Set<string>()
  const sel = selectUnscanned(ids, known, opts.maxEmails)

  const emails: EmailMetadata[] = []
  const batchSize = 20
  for (let i = 0; i < sel.batch.length; i += batchSize) {
    const batch = sel.batch.slice(i, i + batchSize)
    emails.push(...(await Promise.all(batch.map((id) => fetchSingleEmail(gmail, id)))))
  }

  return { emails, totalInWindow: ids.length, alreadyScanned: sel.alreadyScanned, remaining: sel.remaining, newAccessToken }
}
