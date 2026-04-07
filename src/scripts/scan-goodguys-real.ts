/**
 * One-off: run the REAL scanner for Good Guys (not the debug script).
 * Tests the full pipeline: Gmail search → download → PDF parse → extract → save to DB.
 */
import { db } from '@/lib/db'
import { invoices, invoiceSuppliers } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { scanAllSuppliers } from '@/lib/financials/invoice-scanner'
import { accounts } from '@/lib/db/schema'

async function main() {
  // Clear existing Good Guys records
  const deleted = await db.delete(invoices).where(eq(invoices.supplierName, 'Good Guys Mobile')).returning({ id: invoices.id })
  console.log(`Cleared ${deleted.length} existing Good Guys records`)

  // Temporarily deactivate all suppliers except Good Guys
  const allSuppliers = await db.select().from(invoiceSuppliers)
  const nonGG = allSuppliers.filter(s => s.name !== 'Good Guys Mobile')
  for (const s of nonGG) {
    await db.update(invoiceSuppliers).set({ isActive: false }).where(eq(invoiceSuppliers.id, s.id))
  }

  // Get token
  const [account] = await db.select().from(accounts).where(eq(accounts.provider, 'google')).limit(1)
  const token = { accessToken: account!.access_token!, refreshToken: account!.refresh_token, tokenExpiry: account!.expires_at ? new Date(account!.expires_at * 1000) : null }

  console.log('\nRunning REAL scanner for Good Guys Mobile (FY2024-25)...\n')

  const result = await scanAllSuppliers('FY2024-25', token, async (event) => {
    if (event.step) console.log(`  ${event.step}`)
    if (event.type === 'complete') console.log(`\n  COMPLETE: ${event.message}`)
    if (event.type === 'error') console.error(`\n  ERROR: ${event.message}`)
  })

  // Re-activate all suppliers
  for (const s of nonGG) {
    await db.update(invoiceSuppliers).set({ isActive: true }).where(eq(invoiceSuppliers.id, s.id))
  }

  // Show results
  const ggInvoices = await db.select().from(invoices).where(eq(invoices.supplierName, 'Good Guys Mobile'))
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Good Guys results: ${ggInvoices.length} invoices`)
  for (const inv of ggInvoices) {
    console.log(`  ${inv.invoiceDate ?? inv.sourceEmailDate?.toISOString().split('T')[0] ?? '?'} | $${inv.totalAmount ?? 'null'} | ${inv.invoiceNumber ?? 'no#'} | PDF: ${inv.pdfBlobUrl ? 'YES' : 'no'} | ${inv.description?.slice(0, 50)}`)
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
