import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

async function main() {
  const rows = await db.select({
    fy: invoices.fy,
    invoiceDate: invoices.invoiceDate,
    emailDate: sql<string>`to_char(${invoices.sourceEmailDate}, 'YYYY-MM-DD')`,
    total: invoices.totalAmount,
    invNum: invoices.invoiceNumber,
    desc: invoices.description,
  }).from(invoices)
    .where(eq(invoices.supplierName, 'Microsoft'))
    .orderBy(invoices.invoiceDate)

  console.log(`Microsoft: ${rows.length} total invoices\n`)

  // Group by FY
  const byFy = new Map<string, typeof rows>()
  for (const r of rows) {
    const fy = r.fy ?? 'unknown'
    if (!byFy.has(fy)) byFy.set(fy, [])
    byFy.get(fy)!.push(r)
  }

  for (const [fy, items] of [...byFy.entries()].sort()) {
    const total = items.reduce((s, i) => s + (i.total ? Number(i.total) : 0), 0)
    const withAmt = items.filter(i => i.total !== null).length
    console.log(`\n${fy}: ${items.length} invoices, $${total.toFixed(2)} (${withAmt} with amounts)`)
    for (const i of items.slice(0, 10)) {
      console.log(`  inv=${i.invoiceDate ?? '?'} email=${i.emailDate ?? '?'} $${i.total ?? 'null'} | ${i.desc?.slice(0, 55)}`)
    }
    if (items.length > 10) console.log(`  ... +${items.length - 10} more`)
  }

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
