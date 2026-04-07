/**
 * Clear Evernote + Apple invoices so the next scan re-extracts with the improved parser.
 */
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'

async function main() {
  const deleted = await db.delete(invoices)
    .where(or(
      eq(invoices.supplierName, 'Evernote'),
      eq(invoices.supplierName, 'Apple Services'),
    ))
    .returning({ id: invoices.id })
  console.log(`Cleared ${deleted.length} Evernote + Apple records. Re-scan to re-extract with improved parser.`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
