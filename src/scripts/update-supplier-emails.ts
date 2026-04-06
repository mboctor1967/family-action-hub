/**
 * One-time: populate sender_emails for the 4 seeded suppliers.
 * Extracted from the standalone Invoice Reader's output Excel files.
 *
 * Run: node --env-file=.env.local --import tsx src/scripts/update-supplier-emails.ts
 */

import { db } from '@/lib/db'
import { invoiceSuppliers } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

const UPDATES = [
  {
    name: 'Wilson Parking',
    fy: 'FY2024-25',
    senderEmails: [
      'noreply@wilsonparking.com.au',
      'reply@email.wilsonparking.com.au',
      'info@wilsonparking.com.au',
    ],
  },
  {
    name: 'Good Guys Mobile',
    fy: 'FY2024-25',
    // The debug output shows emails FROM Maged himself (dthree.io) — likely forwarded receipts
    // The actual Good Guys sender may be different. Let's use broad keywords instead.
    senderEmails: [], // leave empty — rely on keywords for this supplier
  },
  {
    name: 'Evernote',
    fy: 'FY2024-25',
    senderEmails: [
      'no-reply@mail.evernote.com',
      'no_reply@email.apple.com', // Evernote subscription billed via Apple
    ],
  },
  {
    name: 'OfficeWorks',
    fy: 'FY2024-25',
    senderEmails: [], // no output data found — user to fill in manually
  },
]

async function main() {
  for (const upd of UPDATES) {
    if (upd.senderEmails.length === 0) {
      console.log(`  SKIP: ${upd.name} — no sender emails to set (will rely on label/keywords)`)
      continue
    }

    const result = await db
      .update(invoiceSuppliers)
      .set({ senderEmails: upd.senderEmails, updatedAt: new Date() })
      .where(and(eq(invoiceSuppliers.name, upd.name), eq(invoiceSuppliers.fy, upd.fy)))
      .returning({ id: invoiceSuppliers.id })

    if (result.length > 0) {
      console.log(`  ✓ ${upd.name}: set ${upd.senderEmails.length} sender emails → ${upd.senderEmails.join(', ')}`)
    } else {
      console.log(`  ✗ ${upd.name}: not found in DB`)
    }
  }

  console.log('\nDone. Go to /financials/invoices and try scanning Wilson Parking or Evernote.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
