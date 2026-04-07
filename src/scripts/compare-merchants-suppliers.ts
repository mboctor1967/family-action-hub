import { db } from '@/lib/db'
import { financialTransactions, invoiceSuppliers } from '@/lib/db/schema'
import { sql, isNotNull } from 'drizzle-orm'

async function main() {
  // Get all supplier names
  const suppliers = await db.select({ name: invoiceSuppliers.name }).from(invoiceSuppliers)
  console.log('=== INVOICE SUPPLIERS ===')
  suppliers.forEach(s => console.log(`  ${s.name}`))

  // Get distinct merchant names that might match
  console.log('\n=== TRANSACTION MERCHANTS (matching supplier names) ===')
  for (const sup of suppliers) {
    const words = sup.name.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    for (const word of words) {
      const matches = await db.selectDistinct({ m: financialTransactions.merchantName })
        .from(financialTransactions)
        .where(sql`lower(${financialTransactions.merchantName}) LIKE ${'%' + word + '%'}`)
        .limit(10)
      if (matches.length > 0) {
        console.log(`\n  "${sup.name}" — word "${word}" matches:`)
        matches.forEach(m => console.log(`    → "${m.m}"`))
      }
    }
  }

  // Show all distinct merchants for reference
  const allMerchants = await db.select({
    m: financialTransactions.merchantName,
    n: sql<number>`count(*)`,
    total: sql<number>`sum(abs(${financialTransactions.amount}::numeric))`,
  }).from(financialTransactions)
    .where(isNotNull(financialTransactions.merchantName))
    .groupBy(financialTransactions.merchantName)
    .orderBy(sql`count(*) desc`)
    .limit(30)

  console.log('\n=== TOP 30 MERCHANTS BY TRANSACTION COUNT ===')
  allMerchants.forEach(m => {
    console.log(`  ${String(m.n).padStart(4)} txns  $${Number(m.total).toFixed(0).padStart(8)}  ${m.m}`)
  })

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
