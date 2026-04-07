import { db } from '@/lib/db'
import { invoiceSuppliers, invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  // Fix keywords to be invoice-specific (drops marketing)
  await db.update(invoiceSuppliers)
    .set({
      keywords: ['order confirmation', 'your order', 'receipt', 'invoice', 'dispatch', 'order number', 'tax invoice'],
      updatedAt: new Date(),
    })
    .where(eq(invoiceSuppliers.name, 'Good Guys Mobile'))

  // Delete the 8 marketing records
  const deleted = await db.delete(invoices).where(eq(invoices.supplierName, 'Good Guys Mobile')).returning({ id: invoices.id })
  console.log(`Good Guys: updated keywords + deleted ${deleted.length} marketing records`)

  // Also fix Evernote keywords (Apple sends generic emails — be more specific)
  await db.update(invoiceSuppliers)
    .set({
      keywords: ['tax invoice', 'receipt', 'subscription', 'Evernote', 'renewal', 'billed'],
      updatedAt: new Date(),
    })
    .where(eq(invoiceSuppliers.name, 'Evernote'))

  console.log('Evernote: updated keywords')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
