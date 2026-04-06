import { db } from '@/lib/db'
import { invoiceSuppliers, financialEntities } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
async function main() {
  const [biz] = await db.select().from(financialEntities).where(eq(financialEntities.type, 'business')).limit(1)
  const [created] = await db.insert(invoiceSuppliers).values({
    name: 'Apple Services',
    entityId: biz?.id ?? null,
    senderEmails: ['no_reply@email.apple.com'],
    keywords: ['invoice', 'receipt', 'subscription', 'Apple', 'iCloud', 'payment'],
    fy: 'FY2024-25',
    defaultAtoCode: '6-OTHER-SUBS',
    isActive: true,
  }).returning({ id: invoiceSuppliers.id })
  console.log('Apple Services created:', created)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
