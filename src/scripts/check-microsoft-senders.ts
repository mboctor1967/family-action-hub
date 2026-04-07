import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { eq, sql, isNotNull } from 'drizzle-orm'

async function main() {
  const rows = await db.select({
    from: invoices.sourceFrom,
    desc: invoices.description,
    total: invoices.totalAmount,
    n: sql<number>`count(*) over (partition by ${invoices.sourceFrom})`,
  }).from(invoices)
    .where(eq(invoices.supplierName, 'Microsoft'))
    .orderBy(invoices.sourceFrom)

  // Group by sender
  const bySender = new Map<string, { count: number; subjects: string[]; hasAmount: number }>()
  for (const r of rows) {
    const from = r.from ?? 'unknown'
    if (!bySender.has(from)) bySender.set(from, { count: 0, subjects: [], hasAmount: 0 })
    const g = bySender.get(from)!
    g.count++
    if (g.subjects.length < 3) g.subjects.push(r.desc?.slice(0, 50) ?? '')
    if (r.total) g.hasAmount++
  }

  console.log('Microsoft invoices grouped by sender:\n')
  for (const [from, g] of [...bySender.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`${from}`)
    console.log(`  Count: ${g.count} | With $: ${g.hasAmount}`)
    console.log(`  Subjects: ${g.subjects.join(' | ')}`)
    console.log()
  }

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
