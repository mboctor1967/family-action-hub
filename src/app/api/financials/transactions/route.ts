import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialTransactions, financialAccounts } from '@/lib/db/schema'
import { and, eq, gte, lte, sql, desc } from 'drizzle-orm'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')
  const category = searchParams.get('category')
  const useAi = searchParams.get('use_ai') === '1'
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const needsReview = searchParams.get('needs_review')
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)
  const offset = (page - 1) * limit

  const merchant = searchParams.get('merchant')

  const conditions = []
  if (accountId) conditions.push(eq(financialTransactions.accountId, accountId))
  if (category) {
    // When use_ai is on, match the same grouping the spending page uses: confirmed category
    // (excluding 'OTHER') OR AI-suggested category.
    if (useAi) {
      conditions.push(sql`(
        (${financialTransactions.category} is not null and ${financialTransactions.category} <> 'OTHER' and ${financialTransactions.category} = ${category})
        or (
          (${financialTransactions.category} is null or ${financialTransactions.category} = 'OTHER')
          and ${financialTransactions.aiSuggestedCategory} = ${category}
        )
      )`)
    } else {
      conditions.push(eq(financialTransactions.category, category))
    }
  }
  if (merchant) conditions.push(eq(financialTransactions.merchantName, merchant))
  if (from) conditions.push(gte(financialTransactions.transactionDate, from))
  if (to) conditions.push(lte(financialTransactions.transactionDate, to))
  if (needsReview === 'true') conditions.push(eq(financialTransactions.needsReview, true))

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [transactions, countResult] = await Promise.all([
    db.select({
      id: financialTransactions.id,
      transactionDate: financialTransactions.transactionDate,
      descriptionRaw: financialTransactions.descriptionRaw,
      merchantName: financialTransactions.merchantName,
      amount: financialTransactions.amount,
      isDebit: financialTransactions.isDebit,
      category: financialTransactions.category,
      subcategory: financialTransactions.subcategory,
      isSubscription: financialTransactions.isSubscription,
      isTaxDeductible: financialTransactions.isTaxDeductible,
      taxCategory: financialTransactions.taxCategory,
      needsReview: financialTransactions.needsReview,
      accountId: financialTransactions.accountId,
      bankName: financialAccounts.bankName,
      accountName: financialAccounts.accountName,
    })
      .from(financialTransactions)
      .leftJoin(financialAccounts, eq(financialTransactions.accountId, financialAccounts.id))
      .where(whereClause)
      .orderBy(desc(financialTransactions.transactionDate))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` })
      .from(financialTransactions)
      .where(whereClause),
  ])

  return NextResponse.json({
    transactions,
    pagination: {
      page,
      limit,
      total: Number(countResult[0]?.count || 0),
      total_pages: Math.ceil(Number(countResult[0]?.count || 0) / limit),
    },
  })
}
