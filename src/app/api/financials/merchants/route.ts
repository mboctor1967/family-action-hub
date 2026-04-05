import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialTransactions } from '@/lib/db/schema'
import { sql, eq, and, inArray } from 'drizzle-orm'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const merchants = await db.select({
    merchantName: financialTransactions.merchantName,
    category: financialTransactions.category,
    subcategory: financialTransactions.subcategory,
    txnCount: sql<number>`count(*)`,
    totalAmount: sql<number>`sum(${financialTransactions.amount}::numeric)`,
    totalDebit: sql<number>`sum(abs(${financialTransactions.amount}::numeric)) filter (where ${financialTransactions.amount}::numeric < 0)`,
    totalCredit: sql<number>`sum(${financialTransactions.amount}::numeric) filter (where ${financialTransactions.amount}::numeric > 0)`,
    isDebitMostly: sql<boolean>`count(*) filter (where ${financialTransactions.amount}::numeric < 0) > count(*) filter (where ${financialTransactions.amount}::numeric > 0)`,
  })
    .from(financialTransactions)
    .where(sql`${financialTransactions.merchantName} is not null`)
    .groupBy(financialTransactions.merchantName, financialTransactions.category, financialTransactions.subcategory)
    .orderBy(sql`count(*) desc`)

  const uncategorized = merchants.filter((m) => !m.category || m.category === 'OTHER').length
  const categorized = merchants.filter((m) => m.category && m.category !== 'OTHER').length

  return NextResponse.json({ merchants, uncategorized, categorized, total: merchants.length })
}

// Bulk update: assign category to all transactions with a given merchant name
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { updates } = body as {
    updates: Array<{
      merchantName: string
      category: string
      subcategory?: string | null
      isTaxDeductible?: boolean
      taxCategory?: string | null
      isSubscription?: boolean
      subscriptionFrequency?: string | null
      // Phase F1 — ATO code confirmation fields
      atoCodePersonal?: string | null
      atoCodeCompany?: string | null
      acceptAiSuggestions?: boolean
    }>
  }

  if (!updates?.length) return NextResponse.json({ error: 'No updates' }, { status: 400 })

  let updated = 0
  for (const u of updates) {
    const fields: Record<string, any> = { category: u.category }
    if (u.subcategory !== undefined) fields.subcategory = u.subcategory
    if (u.isTaxDeductible !== undefined) fields.isTaxDeductible = u.isTaxDeductible
    if (u.taxCategory !== undefined) fields.taxCategory = u.taxCategory
    if (u.isSubscription !== undefined) fields.isSubscription = u.isSubscription
    if (u.subscriptionFrequency !== undefined) fields.subscriptionFrequency = u.subscriptionFrequency
    // Phase F1 — ATO code confirmation
    if (u.atoCodePersonal !== undefined) fields.atoCodePersonal = u.atoCodePersonal
    if (u.atoCodeCompany !== undefined) fields.atoCodeCompany = u.atoCodeCompany

    // "Accept AI suggestions" = copy ai_suggested_* into confirmed columns (one-click accept)
    if (u.acceptAiSuggestions) {
      // Handled via a SQL expression below — can't set in fields map since we need column references
    }

    if (u.acceptAiSuggestions) {
      const result = await db.update(financialTransactions)
        .set({
          ...fields,
          // Copy AI suggestions into confirmed columns (preserving any explicit overrides in fields)
          atoCodePersonal: u.atoCodePersonal !== undefined ? u.atoCodePersonal : sql`coalesce(${financialTransactions.atoCodePersonal}, ${financialTransactions.aiSuggestedAtoCodePersonal})`,
          atoCodeCompany: u.atoCodeCompany !== undefined ? u.atoCodeCompany : sql`coalesce(${financialTransactions.atoCodeCompany}, ${financialTransactions.aiSuggestedAtoCodeCompany})`,
        })
        .where(eq(financialTransactions.merchantName, u.merchantName))
        .returning({ id: financialTransactions.id })
      updated += result.length
    } else {
      const result = await db.update(financialTransactions)
        .set(fields)
        .where(eq(financialTransactions.merchantName, u.merchantName))
        .returning({ id: financialTransactions.id })
      updated += result.length
    }
  }

  return NextResponse.json({ success: true, updated })
}
