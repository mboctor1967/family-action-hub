/**
 * Debug: compare amount extraction for Good Guys and Evernote.
 * Shows raw text samples to understand why amounts are missing.
 */

import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { eq, isNull, isNotNull, sql } from 'drizzle-orm'

async function debugSupplier(name: string) {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`SUPPLIER: ${name}`)
  console.log('='.repeat(70))

  const all = await db.select().from(invoices).where(eq(invoices.supplierName, name))
  const withAmt = all.filter(r => r.totalAmount !== null)
  const withoutAmt = all.filter(r => r.totalAmount === null)

  console.log(`Total: ${all.length} | With $: ${withAmt.length} | Without $: ${withoutAmt.length}`)

  // Show samples WITH amounts (what worked)
  if (withAmt.length > 0) {
    console.log(`\n--- WORKING (has amount) — first 3 ---`)
    for (const inv of withAmt.slice(0, 3)) {
      console.log(`  ${inv.description?.slice(0, 60)} | $${inv.totalAmount} | GST: ${inv.gstAmount ?? 'null'}`)
      // Find the dollar amount in raw text
      const raw = inv.rawText ?? ''
      const dollarMatches = raw.match(/\$[\d,]+\.\d{2}/g)
      console.log(`  Dollar strings in text: ${dollarMatches?.join(', ') ?? 'NONE'}`)
      console.log(`  Text length: ${raw.length} chars`)
    }
  }

  // Show samples WITHOUT amounts (what failed)
  if (withoutAmt.length > 0) {
    console.log(`\n--- BROKEN (no amount) — first 5 ---`)
    for (const inv of withoutAmt.slice(0, 5)) {
      console.log(`\n  Subject: ${inv.description?.slice(0, 80)}`)
      console.log(`  Type: ${inv.emailType} | Invoice#: ${inv.invoiceNumber ?? 'null'}`)
      const raw = inv.rawText ?? ''
      console.log(`  Text length: ${raw.length} chars`)

      // Find ALL dollar amounts in the raw text
      const dollarMatches = raw.match(/\$[\d,]+\.\d{2}/g)
      console.log(`  Dollar strings found: ${dollarMatches?.join(', ') ?? 'NONE'}`)

      // Check if it looks like marketing
      const hasMarketingWords = /sale|deal|hurry|save|limited|shop now|buy now|offer/i.test(raw)
      console.log(`  Marketing keywords: ${hasMarketingWords ? 'YES ⚠' : 'no'}`)

      // Show first 400 chars of raw text for inspection
      const preview = raw.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').slice(0, 400)
      console.log(`  Preview: ${preview}`)
    }
  }

  // Type breakdown
  const types = new Map<string, number>()
  for (const inv of all) {
    const t = inv.emailType ?? 'null'
    types.set(t, (types.get(t) ?? 0) + 1)
  }
  console.log(`\n  Type breakdown: ${[...types.entries()].map(([t, n]) => `${t}=${n}`).join(', ')}`)
}

async function main() {
  await debugSupplier('Good Guys Mobile')
  await debugSupplier('Evernote')

  // Also check Apple Services
  const appleCount = await db.select({ n: sql<number>`count(*)` }).from(invoices).where(eq(invoices.supplierName, 'Apple Services'))
  if (Number(appleCount[0].n) > 0) {
    await debugSupplier('Apple Services')
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
