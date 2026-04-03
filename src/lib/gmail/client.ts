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
export async function createGmailClient(token: TokenInfo): Promise<{
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

  // Check if token is expired or about to expire (within 5 minutes)
  const isExpired = token.tokenExpiry && new Date(token.tokenExpiry).getTime() < Date.now() + 5 * 60 * 1000
  let newAccessToken: string | undefined

  if (isExpired && token.refreshToken) {
    try {
      const { credentials } = await oauth2.refreshAccessToken()
      oauth2.setCredentials(credentials)
      newAccessToken = credentials.access_token || undefined
    } catch (err) {
      console.error('Failed to refresh token:', err)
      throw new Error('Gmail token expired and refresh failed. Please reconnect your Gmail account in Settings.')
    }
  }

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2 }),
    newAccessToken,
  }
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
  const { gmail, newAccessToken } = await createGmailClient(token)

  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  })

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
