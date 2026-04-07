import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
async function main() {
  const [inv] = await db.select().from(invoices).where(eq(invoices.supplierName, 'Good Guys Mobile')).limit(1)
  if (!inv) { console.log('No Good Guys invoice found'); process.exit(0) }
  console.log('Subject:', inv.description)
  console.log('Amount:', inv.totalAmount)
  console.log('Invoice#:', inv.invoiceNumber)
  console.log('Type:', inv.emailType)
  console.log('Raw text length:', inv.rawText?.length ?? 0)
  console.log('\n--- First 1000 chars of raw text ---')
  console.log(inv.rawText?.slice(0, 1000))
  console.log('\n--- Dollar patterns found ---')
  const dollars = inv.rawText?.match(/\$[\d,]+\.?\d*/g)
  console.log(dollars ?? 'NONE')
  console.log('\n--- Total/Amount patterns ---')
  const totals = inv.rawText?.match(/(?:total|amount|sub.?total|gst|tax)[\s:$\d.,]+/gi)
  console.log(totals?.slice(0, 10) ?? 'NONE')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
