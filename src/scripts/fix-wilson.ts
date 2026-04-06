import { db } from '@/lib/db'
import { invoiceSuppliers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  const result = await db
    .update(invoiceSuppliers)
    .set({
      senderEmails: [
        'noreply@wilsonparking.com.au',
        'reply@email.wilsonparking.com.au',
        'info@wilsonparking.com.au',
      ],
      updatedAt: new Date(),
    })
    .where(eq(invoiceSuppliers.name, 'Wilson Parking'))
    .returning({ id: invoiceSuppliers.id, fy: invoiceSuppliers.fy })

  console.log('Updated:', result)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
