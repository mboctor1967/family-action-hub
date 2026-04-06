/**
 * One-off comparison: standalone Invoice Reader output vs hub scanner results.
 * Run: node --env-file=.env.local --import tsx src/scripts/compare-invoice-counts.ts
 *
 * Archive this script after calibration is complete.
 */

import { db } from '@/lib/db'
import { invoices, invoiceSuppliers } from '@/lib/db/schema'
import { eq, sql, and } from 'drizzle-orm'

// Standalone app results (extracted from output Excel files on 2026-04-06)
const STANDALONE_RESULTS = [
  { supplier: 'Wilson Parking', invoices: 21, amount: 2115.25, gst: 192.30, pdfs: 234, fy: 'FY2024-25', dateRange: '2024-08-01 to 2025-06-30' },
  { supplier: 'Good Guys Mobile', invoices: 29, amount: 760.00, gst: 51.80, pdfs: 105, fy: 'custom', dateRange: '2026-03-11 to 2026-03-13' },
  { supplier: 'Evernote', invoices: 22, amount: 421.23, gst: 0, pdfs: 143, fy: 'FY2024-25', dateRange: '2024-08-01 to 2025-06-30' },
  { supplier: 'Microsoft', invoices: 4, amount: 24.68, gst: 0, pdfs: 12, fy: 'FY2024-25', dateRange: '2024-08-01 to 2025-06-30' },
  { supplier: 'OfficeWorks', invoices: 0, amount: 0, gst: 0, pdfs: 0, fy: 'FY2024-25', dateRange: 'no output folder found' },
  { supplier: 'Apple Services', invoices: 0, amount: 0, gst: 0, pdfs: 0, fy: 'FY2024-25', dateRange: 'not in standalone app' },
]

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗')
  console.log('║  INVOICE SCANNER COMPARISON: Standalone vs Hub                  ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝\n')

  // Get hub results per supplier
  const suppliers = await db.select().from(invoiceSuppliers)

  console.log('┌────────────────────┬──────┬────────────┬──────┬────────────┬──────────┐')
  console.log('│ Supplier           │ OLD  │ OLD Amount │ HUB  │ HUB Amount │ DELTA    │')
  console.log('├────────────────────┼──────┼────────────┼──────┼────────────┼──────────┤')

  for (const standalone of STANDALONE_RESULTS) {
    // Find matching hub supplier
    const hubSupplier = suppliers.find(s =>
      s.name.toLowerCase().includes(standalone.supplier.toLowerCase().split(' ')[0])
    )

    let hubCount = 0
    let hubAmount = 0

    if (hubSupplier) {
      const [countRow] = await db
        .select({
          n: sql<number>`count(*)`,
          total: sql<number>`coalesce(sum(${invoices.totalAmount}::numeric), 0)`,
        })
        .from(invoices)
        .where(eq(invoices.supplierId, hubSupplier.id))

      hubCount = Number(countRow?.n ?? 0)
      hubAmount = Number(countRow?.total ?? 0)
    }

    const delta = hubCount - standalone.invoices
    const deltaStr = delta === 0 ? '  OK' : delta > 0 ? ` +${delta}` : ` ${delta} ⚠`

    console.log(
      `│ ${standalone.supplier.padEnd(18)} │ ${String(standalone.invoices).padStart(4)} │ ${('$' + standalone.amount.toFixed(2)).padStart(10)} │ ${String(hubCount).padStart(4)} │ ${('$' + hubAmount.toFixed(2)).padStart(10)} │ ${deltaStr.padStart(8)} │`
    )
  }

  console.log('└────────────────────┴──────┴────────────┴──────┴────────────┴──────────┘')

  // Summary
  const [totalHub] = await db
    .select({
      n: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(${invoices.totalAmount}::numeric), 0)`,
    })
    .from(invoices)

  const totalOld = STANDALONE_RESULTS.reduce((s, r) => s + r.invoices, 0)
  const totalOldAmt = STANDALONE_RESULTS.reduce((s, r) => s + r.amount, 0)

  console.log(`\nStandalone total: ${totalOld} invoices, $${totalOldAmt.toFixed(2)}`)
  console.log(`Hub total:        ${totalHub?.n ?? 0} invoices, $${Number(totalHub?.total ?? 0).toFixed(2)}`)

  if (Number(totalHub?.n ?? 0) < totalOld) {
    console.log(`\n⚠ Hub found FEWER invoices. Possible causes:`)
    console.log('  1. Sender email mismatch — check if all sender addresses are configured')
    console.log('  2. Keyword mismatch — standalone used labels (broader), hub uses sender+keywords (narrower)')
    console.log('  3. Date range mismatch — standalone scanned custom ranges, hub uses FY dates')
    console.log('  4. Missing supplier — Microsoft is in standalone but not in hub')
    console.log('  5. Dedup — hub deduplicates by Gmail message ID; standalone might count the same email twice across folders')
    console.log('\nAction: run this script after a "Scan All" to compare.')
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
