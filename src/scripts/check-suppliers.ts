import { db } from '@/lib/db'
import { invoiceSuppliers } from '@/lib/db/schema'
async function main() {
  const rows = await db.select().from(invoiceSuppliers)
  rows.forEach(r => console.log(`  ${r.name} | fy=${r.fy} | emails=${JSON.stringify(r.senderEmails)} | label=${r.gmailLabel}`))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
