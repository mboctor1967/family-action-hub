/**
 * One-off: scan Good Guys only with verbose logging.
 */
import { db } from '@/lib/db'
import { invoices, invoiceSuppliers } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { searchGmailByQuery, getEmailContent, downloadAttachment } from '@/lib/gmail/search'
import { extractInvoiceFields, findKeywordMatch, htmlToText } from '@/lib/financials/invoice-parser'
import { getDriveTokenForUser } from '@/lib/gdrive/tokens'
import { accounts } from '@/lib/db/schema'
import { parseFy } from '@/lib/financials/tax-export/queries'

const FY = 'FY2024-25'

async function main() {
  // Get supplier config
  const [supplier] = await db.select().from(invoiceSuppliers).where(eq(invoiceSuppliers.name, 'Good Guys Mobile')).limit(1)
  if (!supplier) { console.error('Supplier not found'); process.exit(1) }

  const senderEmails = (supplier.senderEmails as string[]) || []
  const keywords = (supplier.keywords as string[]) || []

  // Get token
  const [account] = await db.select().from(accounts).where(eq(accounts.provider, 'google')).limit(1)
  if (!account?.access_token) { console.error('No OAuth token'); process.exit(1) }
  const token = { accessToken: account.access_token, refreshToken: account.refresh_token, tokenExpiry: account.expires_at ? new Date(account.expires_at * 1000) : null }

  // Date range
  const fyRange = parseFy(FY)
  const scanStart = new Date(fyRange.startDate)
  const scanEnd = new Date(Math.max(new Date(fyRange.endDate).getTime(), Date.now()))

  console.log('='.repeat(70))
  console.log(`GOOD GUYS MOBILE — Debug Scan`)
  console.log('='.repeat(70))
  console.log(`Sender emails: ${senderEmails.join(', ')}`)
  console.log(`Keywords: ${keywords.join(', ')}`)
  console.log(`Date range: ${scanStart.toISOString().split('T')[0]} → ${scanEnd.toISOString().split('T')[0]}`)
  console.log(`FY for tagging: ${FY} (based on invoice date, not email date)`)
  console.log()

  // Search Gmail
  console.log('Searching Gmail...')
  const { messageIds } = await searchGmailByQuery(token, {
    senderEmails,
    keywords: keywords.length > 0 ? keywords : undefined,
    startDate: scanStart,
    endDate: scanEnd,
  }, 500)

  console.log(`Found: ${messageIds.length} emails\n`)

  if (messageIds.length === 0) {
    // Try without keywords to see if sender alone finds emails
    console.log('--- Trying WITHOUT keywords (sender only) ---')
    const { messageIds: broadIds } = await searchGmailByQuery(token, {
      senderEmails,
      startDate: scanStart,
      endDate: scanEnd,
    }, 50)
    console.log(`Sender-only search: ${broadIds.length} emails`)

    if (broadIds.length > 0) {
      console.log('\nFirst 5 email subjects:')
      for (const msgId of broadIds.slice(0, 5)) {
        const email = await getEmailContent(token, msgId)
        console.log(`  ${email.date?.toISOString().split('T')[0] ?? '?'} | ${email.subject}`)
      }
      console.log('\n⚠ Keywords are filtering out all emails. Consider broadening keywords.')
    } else {
      console.log('\n⚠ No emails from these senders at all. Check sender addresses.')
      // Try each sender individually
      for (const sender of senderEmails) {
        const { messageIds: singleIds } = await searchGmailByQuery(token, {
          senderEmails: [sender],
          startDate: scanStart,
          endDate: scanEnd,
        }, 10)
        console.log(`  ${sender}: ${singleIds.length} emails`)
      }
    }
    process.exit(0)
  }

  // Process each email with verbose logging
  let invoiceCount = 0
  let skippedMarketing = 0
  let skippedNoKeyword = 0
  let skippedDupe = 0

  for (let i = 0; i < Math.min(messageIds.length, 30); i++) {
    const msgId = messageIds[i]

    // Dedup
    const existing = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.sourceEmailId, msgId)).limit(1)
    if (existing.length > 0) { skippedDupe++; continue }

    const email = await getEmailContent(token, msgId)
    const textContent = email.htmlBody ? htmlToText(email.htmlBody) : email.textBody
    const rawHtmlLen = email.htmlBody?.length ?? 0

    const hasDollarAmount = /\$\d+\.\d{2}/.test(textContent)
    const isLikelyMarketing = !hasDollarAmount && (textContent.length > 3000 || rawHtmlLen > 20000)

    const kwMatch = keywords.length > 0
      ? findKeywordMatch(email.subject, textContent, email.attachments.map(a => a.filename), [], keywords)
      : { matched: true, keyword: 'n/a', field: 'n/a' }

    const extracted = hasDollarAmount ? extractInvoiceFields(email.subject, textContent) : null

    console.log(`[${i + 1}/${messageIds.length}] ${email.date?.toISOString().split('T')[0] ?? '?'} | ${email.subject.slice(0, 60)}`)
    console.log(`  From: ${email.from.slice(0, 50)}`)
    console.log(`  Text: ${textContent.length} chars | HTML: ${rawHtmlLen} chars | $: ${hasDollarAmount ? 'YES' : 'NO'} | Marketing: ${isLikelyMarketing ? 'YES ⚠' : 'no'}`)
    console.log(`  KW match: ${kwMatch.matched ? `YES (${kwMatch.keyword} in ${kwMatch.field})` : 'NO'}`)
    if (extracted) {
      console.log(`  Amount: $${extracted.totalAmount ?? 'null'} | GST: $${extracted.gstAmount ?? 'null'} | Type: ${extracted.emailType} | Invoice#: ${extracted.invoiceNumber ?? 'null'}`)
    }

    if (isLikelyMarketing) { skippedMarketing++; console.log(`  → SKIP (marketing)`); continue }
    if (!kwMatch.matched) { skippedNoKeyword++; console.log(`  → SKIP (no keyword match)`); continue }

    invoiceCount++
    console.log(`  → INVOICE ✓`)
  }

  console.log(`\n${'─'.repeat(70)}`)
  console.log(`Processed: ${Math.min(messageIds.length, 30)} of ${messageIds.length}`)
  console.log(`Invoices: ${invoiceCount} | Marketing skipped: ${skippedMarketing} | No keyword: ${skippedNoKeyword} | Dupes: ${skippedDupe}`)

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
