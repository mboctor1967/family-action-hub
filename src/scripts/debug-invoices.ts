import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

async function main() {
  const rows = await db.select({
    id: invoices.id,
    supplier: invoices.supplierName,
    invoiceNum: invoices.invoiceNumber,
    totalAmount: invoices.totalAmount,
    gstAmount: invoices.gstAmount,
    pdfUrl: invoices.pdfBlobUrl,
    emailType: invoices.emailType,
    description: invoices.description,
    rawTextLen: sql<number>`length(${invoices.rawText})`,
    rawTextSample: sql<string>`left(${invoices.rawText}, 300)`,
  }).from(invoices).limit(10)

  for (const r of rows) {
    console.log(`\n=== ${r.supplier} | ${r.description?.slice(0, 60)} ===`)
    console.log(`  Amount: ${r.totalAmount ?? 'NULL'} | GST: ${r.gstAmount ?? 'NULL'} | PDF: ${r.pdfUrl ? 'YES' : 'NO'}`)
    console.log(`  Type: ${r.emailType} | Invoice#: ${r.invoiceNum ?? 'NULL'}`)
    console.log(`  Raw text length: ${r.rawTextLen} chars`)
    console.log(`  First 300 chars: ${r.rawTextSample?.replace(/\n/g, ' ').slice(0, 200)}`)
  }

  // Summary
  const [stats] = await db.select({
    total: sql<number>`count(*)`,
    withAmount: sql<number>`count(*) filter (where ${invoices.totalAmount} is not null)`,
    withPdf: sql<number>`count(*) filter (where ${invoices.pdfBlobUrl} is not null)`,
    withText: sql<number>`count(*) filter (where length(${invoices.rawText}) > 100)`,
  }).from(invoices)

  console.log(`\n--- SUMMARY ---`)
  console.log(`Total invoices: ${stats.total}`)
  console.log(`With amount: ${stats.withAmount} (${Math.round(Number(stats.withAmount) / Number(stats.total) * 100)}%)`)
  console.log(`With PDF: ${stats.withPdf} (${Math.round(Number(stats.withPdf) / Number(stats.total) * 100)}%)`)
  console.log(`With text >100 chars: ${stats.withText}`)

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
