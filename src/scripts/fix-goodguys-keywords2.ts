import { db } from '@/lib/db'
import { invoiceSuppliers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
async function main() {
  await db.update(invoiceSuppliers).set({
    keywords: ['good guys', 'goodguys', 'docket', 'invoice', 'receipt', 'order', 'tax invoice'],
    updatedAt: new Date(),
  }).where(eq(invoiceSuppliers.name, 'Good Guys Mobile'))
  console.log('Updated Good Guys keywords to include "good guys" (broader match for forwarded emails)')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
