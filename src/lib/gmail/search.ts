/**
 * Gmail API helper for Invoice Reader integration.
 *
 * Uses the existing Google OAuth tokens (same as Drive access).
 * Scope: https://www.googleapis.com/auth/gmail.readonly (already granted in auth.ts)
 *
 * v0.1.3 — Invoice Reader Integration
 */

import { google } from 'googleapis'
import { createDriveClient } from '@/lib/gdrive/client'

interface TokenInfo {
  accessToken: string
  refreshToken?: string | null
  tokenExpiry?: Date | null
}

export interface GmailMessage {
  id: string
  threadId: string
  date: Date | null
  from: string
  subject: string
  textBody: string
  htmlBody: string
  attachments: GmailAttachment[]
}

export interface GmailAttachment {
  filename: string
  mimeType: string
  size: number
  attachmentId: string
  data?: Buffer // populated when downloaded
}

/**
 * Search Gmail by label and date range (legacy path — used when gmailLabel is set).
 */
export async function searchGmailByLabel(
  token: TokenInfo,
  label: string,
  startDate: Date,
  endDate: Date,
  maxResults = 500
): Promise<{ messageIds: string[]; newAccessToken?: string }> {
  const after = Math.floor(startDate.getTime() / 1000)
  const before = Math.floor(endDate.getTime() / 1000)
  const query = `label:${label.replace(/\s+/g, '-')} after:${after} before:${before}`
  return searchGmail(token, query, maxResults)
}

/**
 * Search Gmail by sender emails + keywords + date range (preferred path).
 *
 * Builds a Gmail-native query like:
 *   from:(noreply@wilsonparking.com.au OR billing@wp.com) (invoice OR receipt) after:2024/07/01 before:2025/06/30
 */
export async function searchGmailByQuery(
  token: TokenInfo,
  opts: {
    senderEmails?: string[] // ["noreply@wilsonparking.com.au"]
    keywords?: string[] // ["invoice", "receipt", "payment"]
    startDate: Date
    endDate: Date
    hasAttachment?: boolean // add "has:attachment" to query
  },
  maxResults = 500
): Promise<{ messageIds: string[]; newAccessToken?: string }> {
  const parts: string[] = []

  // Sender filter
  if (opts.senderEmails && opts.senderEmails.length > 0) {
    if (opts.senderEmails.length === 1) {
      parts.push(`from:${opts.senderEmails[0]}`)
    } else {
      parts.push(`from:(${opts.senderEmails.join(' OR ')})`)
    }
  }

  // Keyword filter (matches subject + body)
  if (opts.keywords && opts.keywords.length > 0) {
    if (opts.keywords.length === 1) {
      parts.push(opts.keywords[0])
    } else {
      parts.push(`(${opts.keywords.join(' OR ')})`)
    }
  }

  // Date range — Gmail uses YYYY/MM/DD format
  const fmt = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  parts.push(`after:${fmt(opts.startDate)}`)
  parts.push(`before:${fmt(opts.endDate)}`)

  if (opts.hasAttachment) parts.push('has:attachment')

  const query = parts.join(' ')
  return searchGmail(token, query, maxResults)
}

/**
 * Core Gmail search — executes a raw Gmail query string.
 */
async function searchGmail(
  token: TokenInfo,
  query: string,
  maxResults: number
): Promise<{ messageIds: string[]; newAccessToken?: string }> {
  const { drive: _, newAccessToken } = await createDriveClient(token)

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  oauth2.setCredentials({
    access_token: newAccessToken ?? token.accessToken,
    refresh_token: token.refreshToken || undefined,
  })

  const gmail = google.gmail({ version: 'v1', auth: oauth2 })
  const messageIds: string[] = []
  let pageToken: string | undefined

  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: Math.min(maxResults - messageIds.length, 100),
      pageToken,
    })

    for (const msg of res.data.messages || []) {
      if (msg.id) messageIds.push(msg.id)
    }

    pageToken = res.data.nextPageToken || undefined
  } while (pageToken && messageIds.length < maxResults)

  return { messageIds, newAccessToken }
}

/**
 * Get full email content for a single message.
 * Downloads all attachments inline.
 */
export async function getEmailContent(
  token: TokenInfo,
  messageId: string
): Promise<GmailMessage> {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  oauth2.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken || undefined,
  })

  const gmail = google.gmail({ version: 'v1', auth: oauth2 })

  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })

  const headers = msg.data.payload?.headers || []
  const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

  const subject = getHeader('Subject')
  const from = getHeader('From')
  const dateStr = getHeader('Date')
  const date = dateStr ? new Date(dateStr) : null

  // Extract text and HTML body
  let textBody = ''
  let htmlBody = ''
  const attachments: GmailAttachment[] = []

  function walkParts(parts: any[]) {
    for (const part of parts) {
      const mimeType = part.mimeType || ''
      const filename = part.filename || ''

      if (mimeType === 'text/plain' && !filename && part.body?.data) {
        textBody += Buffer.from(part.body.data, 'base64url').toString('utf-8')
      } else if (mimeType === 'text/html' && !filename && part.body?.data) {
        htmlBody += Buffer.from(part.body.data, 'base64url').toString('utf-8')
      } else if (filename && part.body?.attachmentId) {
        attachments.push({
          filename,
          mimeType,
          size: part.body.size || 0,
          attachmentId: part.body.attachmentId,
        })
      }

      if (part.parts) walkParts(part.parts)
    }
  }

  if (msg.data.payload?.parts) {
    walkParts(msg.data.payload.parts)
  } else if (msg.data.payload?.body?.data) {
    const mimeType = msg.data.payload.mimeType || ''
    const decoded = Buffer.from(msg.data.payload.body.data, 'base64url').toString('utf-8')
    if (mimeType === 'text/html') htmlBody = decoded
    else textBody = decoded
  }

  return {
    id: messageId,
    threadId: msg.data.threadId || '',
    date,
    from,
    subject,
    textBody,
    htmlBody,
    attachments,
  }
}

/**
 * Download an email attachment by its attachmentId.
 */
export async function downloadAttachment(
  token: TokenInfo,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  oauth2.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken || undefined,
  })

  const gmail = google.gmail({ version: 'v1', auth: oauth2 })

  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  })

  return Buffer.from(res.data.data || '', 'base64url')
}
