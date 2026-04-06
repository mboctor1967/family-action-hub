import { db } from '@/lib/db'
import { invoiceSuppliers, financialEntities } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
async function main() {
  const [biz] = await db.select().from(financialEntities).where(eq(financialEntities.type, 'business')).limit(1)
  const [created] = await db.insert(invoiceSuppliers).values({
    name: 'Microsoft',
    entityId: biz?.id ?? null,
    senderEmails: ['microsoft-noreply@microsoft.com'],
    keywords: ['invoice', 'receipt', 'subscription', 'Microsoft 365', 'payment', 'order'],
    fy: 'FY2024-25',
    defaultAtoCode: '6-OTHER-SUBS',
    isActive: true,
  }).returning({ id: invoiceSuppliers.id })
  console.log('Microsoft created:', created)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
