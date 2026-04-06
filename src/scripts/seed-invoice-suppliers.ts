/**
 * One-time migration: seed invoice_suppliers from the standalone Invoice Reader's suppliers.js
 *
 * Source: C:\Users\MagedBoctor\Claude\Invoice Reader\script\suppliers.js
 *
 * Run: node --env-file=.env.local --import tsx src/scripts/seed-invoice-suppliers.ts
 */

import { db } from '@/lib/db'
import { invoiceSuppliers, financialEntities } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

const SUPPLIERS = [
  {
    name: 'Wilson Parking',
    gmailLabel: 'Wilson 2024-25',
    keywords: ['Daily Pass Bundle', 'Sydney Opera House', 'flexi saver', 'invoice', 'receipt', 'payment'],
    entityHint: 'business', // D3 Pty Ltd — parking is a business expense
    defaultAtoCode: '6-MV',
    fy: 'FY2024-25',
    // Sender email TBD — user should check inbox and update via UI
    senderEmails: [],
  },
  {
    name: 'Good Guys Mobile',
    gmailLabel: 'GoodGuys 2024-25',
    keywords: ['Good Guys', 'Mobile'],
    entityHint: 'business', // D3 or Personal — user assigns
    defaultAtoCode: '6-OTHER-OFFICE',
    fy: 'FY2024-25',
    senderEmails: [],
  },
  {
    name: 'Evernote',
    gmailLabel: 'Evernote 2024-25',
    keywords: ['Apple', 'Cost', 'Notes Organizer', 'paid'],
    entityHint: 'business', // SaaS — D3
    defaultAtoCode: '6-OTHER-SUBS',
    fy: 'FY2024-25',
    senderEmails: [],
  },
  {
    name: 'OfficeWorks',
    gmailLabel: 'Officework 2024-25',
    keywords: ['Invoice', 'Order'],
    entityHint: 'business',
    defaultAtoCode: '6-OTHER-OFFICE',
    fy: 'FY2024-25',
    senderEmails: [],
  },
]

async function main() {
  console.log('Seeding invoice suppliers from standalone Invoice Reader config...\n')

  // Find entities to link to
  const entities = await db.select().from(financialEntities)
  console.log(`Found ${entities.length} entities: ${entities.map(e => `${e.name} [${e.type}]`).join(', ')}`)

  // Find the first business entity for business suppliers
  const businessEntity = entities.find(e => e.type === 'business')
  const personalEntity = entities.find(e => e.type === 'personal')

  if (!businessEntity) console.warn('⚠ No business entity found — suppliers will not be linked to an entity')

  let created = 0
  let skipped = 0

  for (const sup of SUPPLIERS) {
    // Check if already exists (by name + fy)
    const existing = await db
      .select({ id: invoiceSuppliers.id })
      .from(invoiceSuppliers)
      .where(sql`${invoiceSuppliers.name} = ${sup.name} AND ${invoiceSuppliers.fy} = ${sup.fy}`)
      .limit(1)

    if (existing.length > 0) {
      console.log(`  SKIP: ${sup.name} (${sup.fy}) — already exists`)
      skipped++
      continue
    }

    const entityId = sup.entityHint === 'business' ? businessEntity?.id : personalEntity?.id

    await db.insert(invoiceSuppliers).values({
      name: sup.name,
      entityId: entityId ?? null,
      gmailLabel: sup.gmailLabel,
      senderEmails: sup.senderEmails,
      keywords: sup.keywords,
      fy: sup.fy,
      defaultAtoCode: sup.defaultAtoCode,
      isActive: true,
    })

    const entityLabel = entityId ? entities.find(e => e.id === entityId)?.name ?? '?' : '(none)'
    console.log(`  ✓ ${sup.name} (${sup.fy}) → entity: ${entityLabel}, ATO: ${sup.defaultAtoCode}, label: ${sup.gmailLabel}`)
    created++
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped`)
  console.log('\n⚠ IMPORTANT: Sender email addresses are empty for all suppliers.')
  console.log('  Go to /financials/invoices → edit each supplier → add the sender email address.')
  console.log('  Check your Gmail inbox for each supplier to find their "From" address.')
  console.log('  Once sender emails are set, you can scan without needing Gmail labels.')

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
