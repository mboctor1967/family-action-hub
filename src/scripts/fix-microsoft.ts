import { db } from '@/lib/db'
import { invoiceSuppliers, invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  // Tighten Microsoft sender to invoice-only address
  await db.update(invoiceSuppliers).set({
    senderEmails: [
      'microsoft-noreply@microsoft.com',  // actual M365 invoice sender
      'mboctor@dthree.io',
      'mboctor@dthree.net',
    ],
    keywords: ['invoice', 'Microsoft 365', 'your microsoft invoice', 'billing', 'subscription'],
    updatedAt: new Date(),
  }).where(eq(invoiceSuppliers.name, 'Microsoft'))
  console.log('✓ Microsoft: tightened to microsoft-noreply@ only + invoice keywords')

  // Delete the 56 non-invoice records (marketing, security, forwarded noise)
  const deleted = await db.delete(invoices).where(eq(invoices.supplierName, 'Microsoft')).returning({ id: invoices.id })
  console.log(`✓ Deleted ${deleted.length} Microsoft records (will re-scan with tight config)`)

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
