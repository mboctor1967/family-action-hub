import { db } from '@/lib/db'
import { invoiceSuppliers, invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { accounts } from '@/lib/db/schema'
import { searchGmailByQuery, getEmailContent } from '@/lib/gmail/search'
import { htmlToText, extractInvoiceFields, findKeywordMatch } from '@/lib/financials/invoice-parser'

async function main() {
  const [sup] = await db.select().from(invoiceSuppliers).where(eq(invoiceSuppliers.name, 'Wilson Parking')).limit(1)
  const senders = (sup!.senderEmails as string[]) || []
  const keywords = (sup!.keywords as string[]) || []

  const [account] = await db.select().from(accounts).where(eq(accounts.provider, 'google')).limit(1)
  const token = { accessToken: account!.access_token!, refreshToken: account!.refresh_token, tokenExpiry: account!.expires_at ? new Date(account!.expires_at * 1000) : null }

  const start = new Date('2024-07-01')
  const end = new Date()

  console.log('='.repeat(70))
  console.log('WILSON PARKING — Diagnostic')
  console.log(`Senders: ${senders.join(', ')}`)
  console.log(`Keywords: ${keywords.join(', ')}`)
  console.log(`Date: ${start.toISOString().split('T')[0]} → ${end.toISOString().split('T')[0]}`)
  console.log('='.repeat(70))

  // Test 1: sender-only (no keywords)
  console.log('\n--- Sender-only search (no keywords) ---')
  const wpSenders = senders.filter(s => !s.includes('dthree'))
  const { messageIds: senderOnly } = await searchGmailByQuery(token, { senderEmails: wpSenders, startDate: start, endDate: end }, 100)
  console.log(`Wilson senders only: ${senderOnly.length} emails`)

  // Test 2: sender + keywords
  const { messageIds: withKw } = await searchGmailByQuery(token, { senderEmails: wpSenders, keywords, startDate: start, endDate: end }, 100)
  console.log(`Wilson senders + keywords: ${withKw.length} emails`)

  // Test 3: forwarded (dthree senders + wilson keywords)
  const { messageIds: forwarded } = await searchGmailByQuery(token, { senderEmails: ['mboctor@dthree.io', 'mboctor@dthree.net'], keywords: ['wilson', 'parking', ...keywords], startDate: start, endDate: end }, 50)
  console.log(`Forwarded (dthree + wilson keywords): ${forwarded.length} emails`)

  // Test 4: all senders + keywords (what the scanner actually runs)
  const { messageIds: actual } = await searchGmailByQuery(token, { senderEmails: senders, keywords, startDate: start, endDate: end }, 100)
  console.log(`All senders + keywords (actual query): ${actual.length} emails`)

  // Show the emails from sender-only that AREN'T in the keyword-filtered set
  const kwSet = new Set(withKw)
  const missed = senderOnly.filter(id => !kwSet.has(id))
  console.log(`\nFiltered OUT by keywords: ${missed.length} emails`)

  // Inspect the missed emails
  if (missed.length > 0) {
    console.log('\n--- Emails found by sender but filtered by keywords ---')
    for (const id of missed.slice(0, 15)) {
      const email = await getEmailContent(token, id)
      const text = email.htmlBody ? htmlToText(email.htmlBody) : email.textBody
      const dollars = text.match(/\$[\d,]+\.\d{2}/g)
      console.log(`  ${email.date?.toISOString().split('T')[0] ?? '?'} | ${email.subject.slice(0, 60)}`)
      console.log(`    From: ${email.from.slice(0, 50)} | $: ${dollars?.slice(0, 3).join(', ') ?? 'NONE'} | text: ${text.length} chars`)
    }
  }

  // Also show what we DID capture
  const hubWilson = await db.select().from(invoices).where(eq(invoices.supplierName, 'Wilson Parking'))
  console.log(`\n--- Currently in hub: ${hubWilson.length} invoices ---`)
  for (const inv of hubWilson) {
    console.log(`  ${inv.invoiceDate ?? '?'} | $${inv.totalAmount ?? 'null'} | ${inv.invoiceNumber ?? 'no#'} | ${inv.description?.slice(0, 50)}`)
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
