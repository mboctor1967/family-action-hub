import { db } from '@/lib/db'
import { invoiceSuppliers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
async function main() {
  const r = await db.update(invoiceSuppliers).set({ senderEmails: ['noreply@officeworks.com.au'], updatedAt: new Date() }).where(eq(invoiceSuppliers.name, 'OfficeWorks')).returning({ id: invoiceSuppliers.id })
  console.log('OfficeWorks updated:', r)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
