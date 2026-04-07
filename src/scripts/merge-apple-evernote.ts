import { db } from '@/lib/db'
import { invoiceSuppliers, invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  // Rename Evernote to Apple Subscriptions
  await db.update(invoiceSuppliers).set({
    name: 'Apple Subscriptions',
    keywords: ['tax invoice', 'receipt', 'subscription', 'Evernote', 'iCloud', 'Apple Music', 'Apple TV', 'renewal', 'billed', 'apple'],
    updatedAt: new Date(),
  }).where(eq(invoiceSuppliers.name, 'Evernote'))
  console.log('✓ Renamed Evernote → Apple Subscriptions + broadened keywords')

  // Update existing invoice records
  await db.update(invoices).set({ supplierName: 'Apple Subscriptions' }).where(eq(invoices.supplierName, 'Evernote'))
  console.log('✓ Updated existing invoice records')

  // Delete Apple Services supplier (its emails will be captured by Apple Subscriptions)
  const deleted = await db.delete(invoiceSuppliers).where(eq(invoiceSuppliers.name, 'Apple Services')).returning({ id: invoiceSuppliers.id })
  console.log(`✓ Deleted Apple Services supplier (${deleted.length} removed)`)

  // Also delete any Apple Services invoices (they'll be re-captured under Apple Subscriptions)
  const delInv = await db.delete(invoices).where(eq(invoices.supplierName, 'Apple Services')).returning({ id: invoices.id })
  console.log(`✓ Deleted ${delInv.length} Apple Services invoice records`)

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
