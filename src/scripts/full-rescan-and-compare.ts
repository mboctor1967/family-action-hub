/**
 * One-off: clear all invoices, scan all suppliers for FY2024-25, then compare with old app.
 *
 * Run: node --env-file=.env.local --import tsx src/scripts/full-rescan-and-compare.ts
 */

import { db } from '@/lib/db'
import { invoices, invoiceSuppliers } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { scanAllSuppliers } from '@/lib/financials/invoice-scanner'
import { getDriveTokenForUser } from '@/lib/gdrive/tokens'
import { accounts } from '@/lib/db/schema'
import { and } from 'drizzle-orm'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const FY = 'FY2024-25'

const OLD_APP_RESULTS = [
  { supplier: 'Wilson Parking', count: 21, total: 2115.25, gst: 192.30 },
  { supplier: 'Good Guys Mobile', count: 29, total: 760.00, gst: 51.80 },
  { supplier: 'Evernote', count: 22, total: 421.23, gst: 0 },
  { supplier: 'Microsoft', count: 4, total: 24.68, gst: 0 },
  { supplier: 'OfficeWorks', count: 0, total: 0, gst: 0 },
  { supplier: 'Apple Services', count: 0, total: 0, gst: 0 },
]

async function main() {
  // Step 1: Clear all invoices
  const [before] = await db.select({ n: sql<number>`count(*)` }).from(invoices)
  console.log(`Clearing ${before.n} existing invoices...`)
  await db.delete(invoices)

  // Step 2: Get OAuth token (find the first admin user)
  const [account] = await db.select().from(accounts).where(eq(accounts.provider, 'google')).limit(1)
  if (!account?.access_token) {
    console.error('No Google OAuth token found. Log in to the app first.')
    process.exit(1)
  }
  const token = {
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
    tokenExpiry: account.expires_at ? new Date(account.expires_at * 1000) : null,
  }

  // Step 3: Scan all suppliers for FY2024-25
  console.log(`\nScanning all suppliers for ${FY} (extended to today for forwarded emails)...\n`)
  const result = await scanAllSuppliers(FY, token, async (event) => {
    if (event.type === 'progress') {
      process.stdout.write(`\r  ${event.step?.padEnd(70)} ${event.percent}%`)
    } else if (event.type === 'complete') {
      console.log(`\n\n  COMPLETE: ${event.message}`)
    } else if (event.type === 'error') {
      console.error(`\n  ERROR: ${event.message}`)
    }
  })

  console.log(`\nScan result: ${result.emailsFound} emails found, ${result.invoicesExtracted} extracted, ${result.duplicatesSkipped} dupes skipped`)
  if (result.errors.length > 0) {
    console.log(`Errors (${result.errors.length}):`)
    result.errors.slice(0, 5).forEach(e => console.log(`  - ${e}`))
  }

  // Step 4: Compare
  console.log('\n' + '='.repeat(70))
  console.log('COMPARISON: Old App vs Hub (after fresh scan)')
  console.log('='.repeat(70))
  console.log(`\n${'Supplier'.padEnd(20)} ${'Old#'.padStart(5)} ${'Old$'.padStart(10)} ${'Hub#'.padStart(5)} ${'Hub$'.padStart(10)} ${'Hub$%'.padStart(7)} ${'Δ#'.padStart(5)} ${'Δ$'.padStart(10)}`)
  console.log('-'.repeat(72))

  const hubBySupplier: Record<string, { count: number; total: number; withAmt: number }> = {}
  const allHub = await db.select().from(invoices).where(eq(invoices.fy, FY))
  for (const inv of allHub) {
    const s = inv.supplierName ?? 'Unknown'
    if (!hubBySupplier[s]) hubBySupplier[s] = { count: 0, total: 0, withAmt: 0 }
    hubBySupplier[s].count++
    if (inv.totalAmount !== null) {
      hubBySupplier[s].total += Number(inv.totalAmount)
      hubBySupplier[s].withAmt++
    }
  }

  for (const old of OLD_APP_RESULTS) {
    const hub = hubBySupplier[old.supplier] ?? { count: 0, total: 0, withAmt: 0 }
    const pctAmt = hub.count > 0 ? Math.round((hub.withAmt / hub.count) * 100) : 0
    const deltaCount = hub.count - old.count
    const deltaTotal = hub.total - old.total
    console.log(
      `${old.supplier.padEnd(20)} ${String(old.count).padStart(5)} ${('$' + old.total.toFixed(2)).padStart(10)} ${String(hub.count).padStart(5)} ${('$' + hub.total.toFixed(2)).padStart(10)} ${(pctAmt + '%$').padStart(7)} ${(deltaCount >= 0 ? '+' + deltaCount : String(deltaCount)).padStart(5)} ${(deltaTotal >= 0 ? '+$' + deltaTotal.toFixed(2) : '-$' + Math.abs(deltaTotal).toFixed(2)).padStart(10)}`
    )
  }

  // Also show any suppliers in hub but not in old app
  for (const [s, h] of Object.entries(hubBySupplier)) {
    if (!OLD_APP_RESULTS.find(o => o.supplier === s)) {
      console.log(`${s.padEnd(20)} ${'—'.padStart(5)} ${'—'.padStart(10)} ${String(h.count).padStart(5)} ${('$' + h.total.toFixed(2)).padStart(10)}`)
    }
  }

  const hubTotal = Object.values(hubBySupplier).reduce((s, h) => s + h.total, 0)
  const hubCount = Object.values(hubBySupplier).reduce((s, h) => s + h.count, 0)
  const oldTotal = OLD_APP_RESULTS.reduce((s, o) => s + o.total, 0)
  const oldCount = OLD_APP_RESULTS.reduce((s, o) => s + o.count, 0)
  console.log('-'.repeat(72))
  console.log(`${'TOTAL'.padEnd(20)} ${String(oldCount).padStart(5)} ${('$' + oldTotal.toFixed(2)).padStart(10)} ${String(hubCount).padStart(5)} ${('$' + hubTotal.toFixed(2)).padStart(10)}`)

  // Step 5: Generate updated comparison Excel
  const OUTPUT_FILE = path.join(process.cwd(), 'docs', 'reference', 'invoice-comparison.xlsx')
  const wb = XLSX.utils.book_new()

  const summaryRows = OLD_APP_RESULTS.map(old => {
    const hub = hubBySupplier[old.supplier] ?? { count: 0, total: 0, withAmt: 0 }
    return {
      'Supplier': old.supplier,
      'Old Count': old.count,
      'Old Total $': old.total,
      'Hub Count': hub.count,
      'Hub With $': hub.withAmt,
      'Hub Total $': Math.round(hub.total * 100) / 100,
      'Delta Count': hub.count - old.count,
      'Delta $': Math.round((hub.total - old.total) * 100) / 100,
      'Amount Coverage %': hub.count > 0 ? Math.round((hub.withAmt / hub.count) * 100) : 0,
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Comparison Summary')

  const hubSheet = XLSX.utils.json_to_sheet(allHub.map(h => ({
    'Supplier': h.supplierName,
    'FY': h.fy,
    'Invoice #': h.invoiceNumber,
    'Invoice Date': h.invoiceDate,
    'Type': h.emailType,
    'Description': h.description?.slice(0, 80),
    'Sub-Total': h.subTotal != null ? Number(h.subTotal) : '',
    'GST': h.gstAmount != null ? Number(h.gstAmount) : '',
    'Total': h.totalAmount != null ? Number(h.totalAmount) : '',
    'ATO Code': h.atoCode,
    'Status': h.status,
    'PDF': h.pdfBlobUrl ? 'YES' : 'no',
    'Email Date': h.sourceEmailDate?.toISOString?.().slice(0, 10) ?? '',
  })))
  XLSX.utils.book_append_sheet(wb, hubSheet, 'Hub Invoices (fresh scan)')

  XLSX.writeFile(wb, OUTPUT_FILE)
  console.log(`\nComparison Excel updated: ${OUTPUT_FILE}`)

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
