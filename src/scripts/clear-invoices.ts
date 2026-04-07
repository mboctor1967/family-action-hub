import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

async function main() {
  const [count] = await db.select({ n: sql<number>`count(*)` }).from(invoices)
  console.log(`Deleting ${count.n} invoices...`)
  await db.delete(invoices)
  console.log('Done. All invoices cleared. Re-scan from the Invoices tab.')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
