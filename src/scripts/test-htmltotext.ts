/**
 * Test: fetch a Wilson Payment Confirmation email and see what htmlToText produces.
 */
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { eq, sql, and } from 'drizzle-orm'
import { htmlToText, extractInvoiceFields } from '@/lib/financials/invoice-parser'

async function main() {
  // Get a Payment Confirmation's raw HTML from DB
  const [inv] = await db.select({
    id: invoices.id,
    description: invoices.description,
    rawText: sql<string>`left(${invoices.rawText}, 50000)`,
  }).from(invoices).where(
    and(eq(invoices.supplierName, 'Wilson Parking'), sql`${invoices.description} = 'Payment Confirmation'`)
  ).limit(1)

  if (!inv) { console.log('No Wilson Payment Confirmation found'); process.exit(0) }

  const rawHtml = inv.rawText ?? ''
  console.log(`Raw HTML length: ${rawHtml.length}`)

  // Strip with the new htmlToText
  const stripped = htmlToText(rawHtml)
  console.log(`Stripped text length: ${stripped.length}`)

  // Find dollar patterns
  const dollars = stripped.match(/\$[\d,]+\.?\d*/g)
  console.log(`\n$ patterns in stripped text: ${dollars?.join(', ') ?? 'NONE'}`)

  const bareNums = stripped.match(/\b\d[\d,]*\.\d{2}\b/g)
  console.log(`Bare numbers: ${bareNums?.slice(0, 10).join(', ') ?? 'NONE'}`)

  // Run extraction
  const extracted = extractInvoiceFields('Payment Confirmation', stripped)
  console.log(`\nExtracted amount: ${extracted.totalAmount ?? 'NULL'}`)
  console.log(`Extracted GST: ${extracted.gstAmount ?? 'NULL'}`)
  console.log(`Extracted type: ${extracted.emailType}`)

  // Show first 600 chars of stripped text
  console.log(`\n--- Stripped text (first 600 chars) ---`)
  console.log(stripped.slice(0, 600))

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
