import { db } from '@/lib/db'
import { invoiceSuppliers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
async function main() {
  const result = await db.update(invoiceSuppliers)
    .set({ senderEmails: ['info@email.thegoodguys.com.au', 'no-reply@thegoodguys.com.au'], updatedAt: new Date() })
    .where(eq(invoiceSuppliers.name, 'Good Guys Mobile'))
    .returning({ id: invoiceSuppliers.id })
  console.log('Updated Good Guys:', result)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
