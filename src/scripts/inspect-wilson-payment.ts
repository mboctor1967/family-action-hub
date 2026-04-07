/**
 * Inspect a Wilson Parking Payment Confirmation to see why amount extraction fails.
 */
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { eq, sql, and, isNull } from 'drizzle-orm'

async function main() {
  // Get a Payment Confirmation record that has no amount
  const rows = await db.select({
    id: invoices.id,
    description: invoices.description,
    totalAmount: invoices.totalAmount,
    rawTextSample: sql<string>`left(${invoices.rawText}, 2000)`,
    rawTextLen: sql<number>`length(${invoices.rawText})`,
  }).from(invoices).where(
    and(
      eq(invoices.supplierName, 'Wilson Parking'),
      sql`${invoices.description} LIKE '%Payment Confirmation%'`
    )
  ).limit(3)

  for (const r of rows) {
    console.log(`\n${'='.repeat(70)}`)
    console.log(`Subject: ${r.description}`)
    console.log(`Amount in DB: ${r.totalAmount ?? 'NULL'}`)
    console.log(`Raw text length: ${r.rawTextLen} chars`)

    const raw = r.rawTextSample ?? ''

    // Find all dollar patterns
    const dollarPatterns = raw.match(/\$[\d,]+\.?\d*/g)
    console.log(`\n$ patterns found: ${dollarPatterns?.join(', ') ?? 'NONE'}`)

    // Find all bare number patterns (XX.XX)
    const bareNumbers = raw.match(/\b\d[\d,]*\.\d{2}\b/g)
    console.log(`Bare numbers (XX.XX): ${bareNumbers?.join(', ') ?? 'NONE'}`)

    // Find total-like patterns
    const totalPatterns = raw.match(/.{0,30}(?:total|amount|charge|paid|gst|sub).{0,30}/gi)
    console.log(`\nTotal/amount context:`)
    totalPatterns?.slice(0, 10).forEach(p => console.log(`  "${p.replace(/\n/g, ' ').trim()}"`))

    // Show the text (stripped of HTML) for inspection
    const isHtml = raw.includes('<html') || raw.includes('<div')
    if (isHtml) {
      // Strip HTML for readability
      const stripped = raw
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s{2,}/g, ' ')
        .trim()
      console.log(`\nStripped text (first 800 chars):`)
      console.log(stripped.slice(0, 800))
    } else {
      console.log(`\nRaw text (first 800 chars):`)
      console.log(raw.slice(0, 800))
    }
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
