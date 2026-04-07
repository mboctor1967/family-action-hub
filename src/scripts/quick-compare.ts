import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

const OLD = [
  { supplier: 'Wilson Parking', count: 21, total: 2115.25 },
  { supplier: 'Good Guys Mobile', count: 29, total: 760.00 },
  { supplier: 'Evernote', count: 22, total: 421.23 },
  { supplier: 'Microsoft', count: 4, total: 24.68 },
  { supplier: 'OfficeWorks', count: 0, total: 0 },
]

async function main() {
  const rows = await db.select({
    supplier: invoices.supplierName,
    fy: invoices.fy,
    n: sql<number>`count(*)`,
    total: sql<number>`coalesce(sum(${invoices.totalAmount}::numeric), 0)`,
    withAmt: sql<number>`count(*) filter (where ${invoices.totalAmount} is not null)`,
    withPdf: sql<number>`count(*) filter (where ${invoices.pdfBlobUrl} is not null)`,
  }).from(invoices).groupBy(invoices.supplierName, invoices.fy).orderBy(invoices.supplierName)

  console.log(`${'Supplier'.padEnd(22)} ${'FY'.padEnd(10)} ${'Old#'.padStart(5)} ${'Old$'.padStart(8)} ${'Hub#'.padStart(5)} ${'Hub$'.padStart(8)} ${'$%'.padStart(5)} ${'PDF'.padStart(5)}`)
  console.log('─'.repeat(75))

  for (const old of OLD) {
    const hubRows = rows.filter(r => r.supplier === old.supplier || (old.supplier === 'Evernote' && r.supplier === 'Apple Subscriptions'))
    if (hubRows.length === 0) {
      console.log(`${old.supplier.padEnd(22)} ${'—'.padEnd(10)} ${String(old.count).padStart(5)} ${('$'+old.total.toFixed(0)).padStart(8)} ${String(0).padStart(5)} ${'$0'.padStart(8)}`)
    }
    for (const h of hubRows) {
      const pct = Number(h.n) > 0 ? Math.round((Number(h.withAmt) / Number(h.n)) * 100) : 0
      console.log(`${(h.supplier ?? '?').padEnd(22)} ${(h.fy ?? '?').padEnd(10)} ${String(old.count).padStart(5)} ${('$'+old.total.toFixed(0)).padStart(8)} ${String(h.n).padStart(5)} ${('$'+Number(h.total).toFixed(0)).padStart(8)} ${(pct+'%').padStart(5)} ${String(h.withPdf).padStart(5)}`)
    }
  }

  const [totals] = await db.select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${invoices.totalAmount}::numeric), 0)` }).from(invoices)
  console.log('─'.repeat(75))
  console.log(`${'TOTAL'.padEnd(22)} ${''.padEnd(10)} ${String(76).padStart(5)} ${'$3321'.padStart(8)} ${String(totals.n).padStart(5)} ${('$'+Number(totals.total).toFixed(0)).padStart(8)}`)

  // FY breakdown
  const fyRows = await db.select({ fy: invoices.fy, n: sql<number>`count(*)` }).from(invoices).groupBy(invoices.fy)
  console.log(`\nFY breakdown: ${fyRows.map(r => `${r.fy}=${r.n}`).join(', ')}`)

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
