/**
 * Re-scan Wilson Parking only with verbose per-email filtering breakdown.
 * Shows exactly why each email is accepted or rejected.
 */
import { db } from '@/lib/db'
import { invoices, invoiceSuppliers } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { accounts } from '@/lib/db/schema'
import { searchGmailByQuery, getEmailContent, downloadAttachment } from '@/lib/gmail/search'
import { htmlToText, extractInvoiceFields, findKeywordMatch } from '@/lib/financials/invoice-parser'
import { parseFy } from '@/lib/financials/tax-export/queries'

async function main() {
  const [sup] = await db.select().from(invoiceSuppliers).where(eq(invoiceSuppliers.name, 'Wilson Parking')).limit(1)
  const senders = (sup!.senderEmails as string[]) || []
  const configKeywords = (sup!.keywords as string[]) || []
  // Auto-include supplier name as keyword (matches the main scanner logic)
  const supplierNameWords = sup!.name.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  const keywords = [...new Set([...configKeywords, ...supplierNameWords, sup!.name.toLowerCase()])]

  const [account] = await db.select().from(accounts).where(eq(accounts.provider, 'google')).limit(1)
  const token = { accessToken: account!.access_token!, refreshToken: account!.refresh_token, tokenExpiry: account!.expires_at ? new Date(account!.expires_at * 1000) : null }

  const fyRange = parseFy('FY2024-25')
  const start = new Date(fyRange.startDate)
  const end = new Date() // extend to today

  console.log('='.repeat(70))
  console.log('WILSON PARKING — Verbose Re-scan')
  console.log(`Senders: ${senders.join(', ')}`)
  console.log(`Keywords: ${keywords.join(', ')}`)
  console.log(`Date: ${start.toISOString().split('T')[0]} → ${end.toISOString().split('T')[0]}`)
  console.log('='.repeat(70))

  // Clear existing Wilson records
  const deleted = await db.delete(invoices).where(eq(invoices.supplierName, 'Wilson Parking')).returning({ id: invoices.id })
  console.log(`\nCleared ${deleted.length} existing Wilson records\n`)

  const { messageIds } = await searchGmailByQuery(token, { senderEmails: senders, keywords, startDate: start, endDate: end }, 100)
  console.log(`Gmail search returned: ${messageIds.length} emails\n`)

  let accepted = 0
  let skippedDupe = 0
  let skippedMarketing = 0
  let skippedNoKeyword = 0
  let saved = 0

  for (let j = 0; j < messageIds.length; j++) {
    const msgId = messageIds[j]

    // Dedup
    const existing = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.sourceEmailId, msgId)).limit(1)
    if (existing.length > 0) {
      skippedDupe++
      continue
    }

    const email = await getEmailContent(token, msgId)
    let textContent = email.htmlBody ? htmlToText(email.htmlBody) : email.textBody
    const subj = email.subject.slice(0, 55)

    // PDF attachments
    let pdfBuffer: Buffer | null = null
    let pdfTextExtracted = false
    const attNames: string[] = []

    for (const att of email.attachments) {
      attNames.push(att.filename)
      const isPdf = att.mimeType === 'application/pdf' ||
        (att.mimeType === 'application/octet-stream' && /\.pdf$/i.test(att.filename)) ||
        /\.pdf$/i.test(att.filename)
      if (isPdf) {
        try {
          const buf = await downloadAttachment(token, msgId, att.attachmentId)
          const pdfParse = (await import('pdf-parse')).default
          const pdfData = await pdfParse(buf)
          if (pdfData.text) { textContent += '\n' + pdfData.text; pdfTextExtracted = true }
          if (!pdfBuffer) pdfBuffer = buf
        } catch {}
      }
    }

    // Keyword match
    const kwMatch = findKeywordMatch(email.subject, textContent, attNames, [], keywords)
    if (!kwMatch.matched) {
      skippedNoKeyword++
      console.log(`[${j+1}/${messageIds.length}] SKIP no-kw | ${email.date?.toISOString().split('T')[0]} | ${subj}`)
      continue
    }

    // Marketing filter (same as main scanner — with PDF bypass)
    const hasDollarAmount = /\$\d+\.\d{2}/.test(textContent) || /\b\d[\d,]*\.\d{2}\b/.test(textContent)
    const hasPdf = pdfBuffer !== null || pdfTextExtracted
    const rawHtmlLen = email.htmlBody?.length ?? 0
    const isMarketing = !hasDollarAmount && !hasPdf && (textContent.length > 3000 || rawHtmlLen > 20000)
    if (isMarketing) {
      skippedMarketing++
      console.log(`[${j+1}/${messageIds.length}] SKIP mktg  | ${email.date?.toISOString().split('T')[0]} | ${subj} | text=${textContent.length} html=${rawHtmlLen}`)
      continue
    }

    // Extract
    const extracted = extractInvoiceFields(email.subject, textContent)
    if (!['Invoice', 'Receipt'].includes(extracted.emailType)) {
      extracted.emailType = 'Invoice'
    }

    accepted++
    const amt = extracted.totalAmount != null ? `$${extracted.totalAmount}` : 'no$'
    const inv = extracted.invoiceNumber ?? 'no#'
    const typ = extracted.emailType
    console.log(`[${j+1}/${messageIds.length}] ✓ ${typ.padEnd(10)} | ${email.date?.toISOString().split('T')[0]} | ${amt.padStart(8)} | ${inv.padEnd(15)} | ${subj}`)

    // Save to DB
    const dateToFy = (d: string) => {
      const dt = new Date(d); const m = dt.getMonth(); const y = dt.getFullYear()
      const sy = m >= 6 ? y : y - 1; return `FY${sy}-${String(sy+1).slice(-2)}`
    }
    const invoiceFy = extracted.invoiceDate ? dateToFy(extracted.invoiceDate) : (email.date ? dateToFy(email.date.toISOString().split('T')[0]) : 'FY2024-25')

    try {
      await db.insert(invoices).values({
        supplierId: sup!.id,
        entityId: sup!.entityId,
        fy: invoiceFy,
        invoiceNumber: extracted.invoiceNumber,
        invoiceDate: extracted.invoiceDate,
        purchaseDate: extracted.purchaseDate,
        serviceDate: extracted.serviceDate,
        referenceNumber: extracted.referenceNumber,
        supplierName: 'Wilson Parking',
        location: extracted.location,
        serviceType: extracted.serviceType,
        description: email.subject,
        emailType: extracted.emailType,
        subTotal: extracted.subTotal !== null ? String(extracted.subTotal) : null,
        gstAmount: extracted.gstAmount !== null ? String(extracted.gstAmount) : null,
        totalAmount: extracted.totalAmount !== null ? String(extracted.totalAmount) : null,
        pdfBlobUrl: null,
        sourceEmailId: msgId,
        sourceEmailDate: email.date,
        sourceFrom: email.from,
        atoCode: sup!.defaultAtoCode,
        status: 'extracted',
        rawText: (email.htmlBody || textContent).slice(0, 50000),
      })
      saved++
    } catch (err: any) {
      if (err.message?.includes('duplicate')) { skippedDupe++ }
      else console.error(`  DB error: ${err.message}`)
    }
  }

  console.log(`\n${'─'.repeat(70)}`)
  console.log(`Emails: ${messageIds.length} | Accepted: ${accepted} | Saved: ${saved}`)
  console.log(`Skipped: ${skippedDupe} dupe, ${skippedMarketing} marketing, ${skippedNoKeyword} no-keyword`)

  // Check for duplicates in DB
  const dupeCheck = await db.select({
    invoiceNumber: invoices.invoiceNumber,
    n: sql<number>`count(*)`,
  }).from(invoices).where(eq(invoices.supplierName, 'Wilson Parking')).groupBy(invoices.invoiceNumber)
  const dupes = dupeCheck.filter(r => Number(r.n) > 1)
  if (dupes.length > 0) {
    console.log(`\n⚠ DUPLICATES found:`)
    dupes.forEach(d => console.log(`  Invoice# ${d.invoiceNumber}: ${d.n} records`))
  } else {
    console.log('\n✅ No duplicate invoice numbers')
  }

  const [total] = await db.select({ n: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(total_amount::numeric), 0)` }).from(invoices).where(eq(invoices.supplierName, 'Wilson Parking'))
  console.log(`\nWilson Parking total: ${total.n} invoices, $${Number(total.sum).toFixed(2)}`)

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
