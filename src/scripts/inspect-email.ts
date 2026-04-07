/**
 * Inspect a single email's full structure — parts, attachments, MIME types.
 */
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { accounts } from '@/lib/db/schema'
import { getEmailContent, downloadAttachment } from '@/lib/gmail/search'
import { google } from 'googleapis'

async function main() {
  // Get the Good Guys invoice's source email ID
  const [inv] = await db.select().from(invoices).where(eq(invoices.supplierName, 'Good Guys Mobile')).limit(1)
  if (!inv?.sourceEmailId) { console.error('No Good Guys invoice found'); process.exit(1) }

  const [account] = await db.select().from(accounts).where(eq(accounts.provider, 'google')).limit(1)
  const token = { accessToken: account!.access_token!, refreshToken: account!.refresh_token, tokenExpiry: account!.expires_at ? new Date(account!.expires_at * 1000) : null }

  // Get full email via Gmail API (raw structure)
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  oauth2.setCredentials({ access_token: token.accessToken, refresh_token: token.refreshToken || undefined })
  const gmail = google.gmail({ version: 'v1', auth: oauth2 })

  const msg = await gmail.users.messages.get({ userId: 'me', id: inv.sourceEmailId, format: 'full' })

  console.log('=== EMAIL STRUCTURE ===')
  console.log(`Subject: ${msg.data.payload?.headers?.find(h => h.name === 'Subject')?.value}`)
  console.log(`From: ${msg.data.payload?.headers?.find(h => h.name === 'From')?.value}`)
  console.log(`Date: ${msg.data.payload?.headers?.find(h => h.name === 'Date')?.value}`)
  console.log(`MIME type: ${msg.data.payload?.mimeType}`)
  console.log()

  function printParts(parts: any[], indent = '') {
    for (const part of parts) {
      const mime = part.mimeType ?? '?'
      const filename = part.filename ?? ''
      const size = part.body?.size ?? 0
      const hasData = !!part.body?.data
      const hasAttId = !!part.body?.attachmentId
      console.log(`${indent}├─ ${mime} ${filename ? `[${filename}]` : ''} size=${size} data=${hasData} attId=${hasAttId}`)
      if (part.parts) printParts(part.parts, indent + '│  ')
    }
  }

  if (msg.data.payload?.parts) {
    console.log('Parts tree:')
    printParts(msg.data.payload.parts)
  } else {
    console.log('No parts (single-body email)')
    console.log(`Body size: ${msg.data.payload?.body?.size}`)
    console.log(`Body has data: ${!!msg.data.payload?.body?.data}`)
  }

  // Also try getEmailContent to see what our helper returns
  console.log('\n=== OUR HELPER OUTPUT ===')
  const email = await getEmailContent(token, inv.sourceEmailId)
  console.log(`Subject: ${email.subject}`)
  console.log(`Text body length: ${email.textBody.length}`)
  console.log(`HTML body length: ${email.htmlBody.length}`)
  console.log(`Attachments: ${email.attachments.length}`)
  for (const att of email.attachments) {
    console.log(`  ${att.filename} | ${att.mimeType} | size=${att.size} | attId=${att.attachmentId.slice(0, 30)}...`)
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
