/**
 * Update supplier sender emails to use domain-based matching where appropriate.
 * @domain.com matches ANY email from that domain — no more guessing specific addresses.
 */
import { db } from '@/lib/db'
import { invoiceSuppliers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const UPDATES: Array<{ name: string; senderEmails: string[] }> = [
  {
    name: 'Wilson Parking',
    senderEmails: [
      '@wilsonparking.com.au',     // domain — catches noreply@, reply@, info@, anything@
      'mboctor@dthree.io',         // forwarded
      'mboctor@dthree.net',
    ],
  },
  {
    name: 'Good Guys Mobile',
    senderEmails: [
      '@thegoodguys.com.au',       // domain — catches noreply@, no-reply@, info@, etc.
      '@email.thegoodguys.com.au', // marketing subdomain
      'mboctor@dthree.io',
      'mboctor@dthree.net',
    ],
  },
  {
    name: 'Evernote',
    senderEmails: [
      '@mail.evernote.com',        // domain
      '@email.apple.com',          // Apple billing (Evernote subscription)
      'mboctor@dthree.io',
      'mboctor@dthree.net',
    ],
  },
  {
    name: 'OfficeWorks',
    senderEmails: [
      '@officeworks.com.au',       // domain — will match ANY officeworks sender
      'mboctor@dthree.io',
      'mboctor@dthree.net',
    ],
  },
  {
    name: 'Apple Services',
    senderEmails: [
      '@email.apple.com',          // domain
      '@apple.com',                // broader Apple domain
      'mboctor@dthree.io',
      'mboctor@dthree.net',
    ],
  },
  {
    name: 'Microsoft',
    senderEmails: [
      '@microsoft.com',            // domain — catches microsoft-noreply@, billing@, etc.
      'mboctor@dthree.io',
      'mboctor@dthree.net',
    ],
  },
]

async function main() {
  for (const upd of UPDATES) {
    const result = await db.update(invoiceSuppliers)
      .set({ senderEmails: upd.senderEmails, updatedAt: new Date() })
      .where(eq(invoiceSuppliers.name, upd.name))
      .returning({ id: invoiceSuppliers.id })

    if (result.length > 0) {
      console.log(`✓ ${upd.name}: ${upd.senderEmails.join(', ')}`)
    } else {
      console.log(`✗ ${upd.name}: not found`)
    }
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
