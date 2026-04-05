import { db } from '@/lib/db'
import { financialSubcategories, financialTransactions } from '@/lib/db/schema'
import { sql, isNotNull } from 'drizzle-orm'

async function main() {
  const txnCats = await db
    .selectDistinct({ c: financialTransactions.category })
    .from(financialTransactions)
    .where(isNotNull(financialTransactions.category))
  console.log('distinct txn.category values:', txnCats.length)
  console.log('categories:')
  txnCats.forEach(r => console.log(`  ${r.c}`))

  // Check how many txns use each
  const txnCatCounts = await db
    .select({ c: financialTransactions.category, n: sql<number>`count(*)` })
    .from(financialTransactions)
    .groupBy(financialTransactions.category)
  console.log('\ncounts:')
  txnCatCounts.forEach(r => console.log(`  ${r.c ?? '(null)'}: ${r.n}`))

  // Mapped subcategory names
  const mappedSubs = await db
    .select({ name: financialSubcategories.name, p: financialSubcategories.atoCodePersonal, c: financialSubcategories.atoCodeCompany })
    .from(financialSubcategories)
    .where(sql`ato_code_personal is not null or ato_code_company is not null`)
  console.log('\nmapped subcategories (sample):')
  mappedSubs.slice(0, 10).forEach(r => console.log(`  ${r.name} -> personal=${r.p}, company=${r.c}`))

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
