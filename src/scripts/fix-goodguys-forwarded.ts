import { db } from '@/lib/db'
import { invoiceSuppliers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
async function main() {
  const [row] = await db.select().from(invoiceSuppliers).where(eq(invoiceSuppliers.name, 'Good Guys Mobile')).limit(1)
  const existing = (row?.senderEmails as string[]) || []
  const updated = [...new Set([...existing, 'mboctor@dthree.io', 'mboctor@dthree.net'])]
  await db.update(invoiceSuppliers).set({ senderEmails: updated, updatedAt: new Date() }).where(eq(invoiceSuppliers.name, 'Good Guys Mobile'))
  console.log('Good Guys sender emails:', updated)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
