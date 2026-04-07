/**
 * Apply all calibration fixes + full re-scan + comparison.
 *
 * 1. Add mboctor@dthree.io + mboctor@dthree.net to ALL suppliers
 * 2. Clear all invoices
 * 3. Scan all suppliers for FY2024-25 with verbose output
 * 4. Compare with old app
 */
import { db } from '@/lib/db'
import { invoices, invoiceSuppliers } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { scanAllSuppliers } from '@/lib/financials/invoice-scanner'
import { accounts } from '@/lib/db/schema'

const FY = 'FY2024-25'
const EXTRA_SENDERS = ['mboctor@dthree.io', 'mboctor@dthree.net']

const OLD_APP = [
  { supplier: 'Wilson Parking', count: 21, total: 2115.25 },
  { supplier: 'Good Guys Mobile', count: 29, total: 760.00 },
  { supplier: 'Evernote', count: 22, total: 421.23 },
  { supplier: 'Microsoft', count: 4, total: 24.68 },
  { supplier: 'OfficeWorks', count: 0, total: 0 },
  { supplier: 'Apple Services', count: 0, total: 0 },
]

async function main() {
  // Step 1: Add forwarded-email senders to ALL suppliers
  console.log('Step 1: Adding forwarded-email senders to all suppliers...')
  const allSuppliers = await db.select().from(invoiceSuppliers)
  for (const sup of allSuppliers) {
    const existing = (sup.senderEmails as string[]) || []
    const updated = [...new Set([...existing, ...EXTRA_SENDERS])]
    if (updated.length > existing.length) {
      await db.update(invoiceSuppliers).set({ senderEmails: updated }).where(eq(invoiceSuppliers.id, sup.id))
      console.log(`  ${sup.name}: added ${updated.length - existing.length} sender(s) → ${updated.length} total`)
    } else {
      console.log(`  ${sup.name}: already has forwarded senders (${existing.length} total)`)
    }
  }

  // Step 2: Show supplier config
  console.log('\nStep 2: Supplier configuration:')
  const suppliers = await db.select().from(invoiceSuppliers)
  for (const s of suppliers) {
    console.log(`\n  ${s.name}:`)
    console.log(`    Sender emails: ${(s.senderEmails as string[]).join(', ')}`)
    console.log(`    Keywords: ${(s.keywords as string[]).join(', ')}`)
    console.log(`    Entity: ${s.entityId ?? 'none'} | ATO: ${s.defaultAtoCode ?? 'none'} | Active: ${s.isActive}`)
  }

  // Step 3: Clear all invoices
  const [before] = await db.select({ n: sql<number>`count(*)` }).from(invoices)
  console.log(`\nStep 3: Clearing ${before.n} existing invoices...`)
  await db.delete(invoices)

  // Step 4: Get token
  const [account] = await db.select().from(accounts).where(eq(accounts.provider, 'google')).limit(1)
  if (!account?.access_token) { console.error('No OAuth token'); process.exit(1) }
  const token = { accessToken: account.access_token, refreshToken: account.refresh_token, tokenExpiry: account.expires_at ? new Date(account.expires_at * 1000) : null }

  // Step 5: Scan
  console.log(`\nStep 5: Scanning all suppliers for ${FY} (extended to today)...\n`)
  const result = await scanAllSuppliers(FY, token, async (event) => {
    if (event.step) console.log(`  ${event.step}`)
    if (event.type === 'complete') console.log(`\n  ✅ ${event.message}`)
    if (event.type === 'error') console.error(`\n  ❌ ${event.message}`)
  })

  console.log(`\nScan summary: ${result.emailsFound} emails → ${result.invoicesExtracted} invoices (${result.duplicatesSkipped} dupes, ${result.errors.length} errors)`)
  if (result.errors.length > 0) {
    console.log('Errors:')
    result.errors.slice(0, 10).forEach(e => console.log(`  - ${e}`))
  }

  // Step 6: Compare
  console.log('\n' + '═'.repeat(72))
  console.log('COMPARISON: Old App vs Hub')
  console.log('═'.repeat(72))

  const allHub = await db.select().from(invoices)
  const hubBySupplier = new Map<string, { count: number; total: number; withAmt: number; withPdf: number }>()
  for (const inv of allHub) {
    const s = inv.supplierName ?? 'Unknown'
    if (!hubBySupplier.has(s)) hubBySupplier.set(s, { count: 0, total: 0, withAmt: 0, withPdf: 0 })
    const g = hubBySupplier.get(s)!
    g.count++
    if (inv.totalAmount) { g.total += Number(inv.totalAmount); g.withAmt++ }
    if (inv.pdfBlobUrl) g.withPdf++
  }

  console.log(`\n${'Supplier'.padEnd(20)} ${'Old#'.padStart(5)} ${'Old$'.padStart(10)} ${'Hub#'.padStart(5)} ${'Hub$'.padStart(10)} ${'$%'.padStart(5)} ${'PDF'.padStart(5)} ${'Δ#'.padStart(5)}`)
  console.log('─'.repeat(72))

  for (const old of OLD_APP) {
    const hub = hubBySupplier.get(old.supplier) ?? { count: 0, total: 0, withAmt: 0, withPdf: 0 }
    const pctAmt = hub.count > 0 ? Math.round((hub.withAmt / hub.count) * 100) : 0
    const delta = hub.count - old.count
    console.log(
      `${old.supplier.padEnd(20)} ${String(old.count).padStart(5)} ${('$' + old.total.toFixed(0)).padStart(10)} ${String(hub.count).padStart(5)} ${('$' + hub.total.toFixed(0)).padStart(10)} ${(pctAmt + '%').padStart(5)} ${String(hub.withPdf).padStart(5)} ${(delta >= 0 ? '+' + delta : String(delta)).padStart(5)}`
    )
  }
  // Show suppliers not in old app
  for (const [s, h] of hubBySupplier) {
    if (!OLD_APP.find(o => o.supplier === s)) {
      console.log(`${s.padEnd(20)} ${'—'.padStart(5)} ${'—'.padStart(10)} ${String(h.count).padStart(5)} ${('$' + h.total.toFixed(0)).padStart(10)} ${(h.count > 0 ? Math.round((h.withAmt / h.count) * 100) + '%' : '0%').padStart(5)} ${String(h.withPdf).padStart(5)}`)
    }
  }

  const hubTotal = Array.from(hubBySupplier.values()).reduce((s, h) => s + h.total, 0)
  const hubCount = Array.from(hubBySupplier.values()).reduce((s, h) => s + h.count, 0)
  const oldTotal = OLD_APP.reduce((s, o) => s + o.total, 0)
  const oldCount = OLD_APP.reduce((s, o) => s + o.count, 0)
  console.log('─'.repeat(72))
  console.log(`${'TOTAL'.padEnd(20)} ${String(oldCount).padStart(5)} ${('$' + oldTotal.toFixed(0)).padStart(10)} ${String(hubCount).padStart(5)} ${('$' + hubTotal.toFixed(0)).padStart(10)}`)

  // FY breakdown
  const fyBreakdown = new Map<string, number>()
  for (const inv of allHub) {
    const f = inv.fy ?? 'unknown'
    fyBreakdown.set(f, (fyBreakdown.get(f) ?? 0) + 1)
  }
  console.log(`\nFY breakdown: ${[...fyBreakdown.entries()].map(([f, n]) => `${f}=${n}`).join(', ')}`)

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
