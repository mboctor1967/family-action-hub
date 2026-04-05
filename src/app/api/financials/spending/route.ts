import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialTransactions, financialAccounts } from '@/lib/db/schema'
import { and, eq, gte, lte, lt, sql, inArray } from 'drizzle-orm'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const now = new Date()
  const from = searchParams.get('from') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = searchParams.get('to') || now.toISOString().slice(0, 10)
  const accountIds = searchParams.get('account_ids')?.split(',').filter(Boolean) || []
  const entityIds = searchParams.get('entity_ids')?.split(',').filter(Boolean) || []
  const accountId = searchParams.get('account_id') // legacy

  // Resolve entity IDs to account IDs
  let filterAccountIds: string[] = [...accountIds]
  if (accountId && filterAccountIds.length === 0) filterAccountIds.push(accountId)
  if (entityIds.length > 0 && filterAccountIds.length === 0) {
    const entityAccounts = await db.select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(inArray(financialAccounts.entityId, entityIds))
    filterAccountIds = entityAccounts.map((a) => a.id)
    if (filterAccountIds.length === 0) {
      return NextResponse.json({ period: { from, to }, categories: [], total_spending: 0, biggest_transactions: [] })
    }
  }

  // Current period spending by category (debits only, excluding confirmed transfers)
  const conditions: any[] = [
    gte(financialTransactions.transactionDate, from),
    lte(financialTransactions.transactionDate, to),
    lt(financialTransactions.amount, '0'), // debits only
    sql`${financialTransactions.transferPairId} is null`, // exclude confirmed transfers
  ]
  if (filterAccountIds.length > 0) conditions.push(inArray(financialTransactions.accountId, filterAccountIds))

  const spending = await db.select({
    category: financialTransactions.category,
    amount: sql<number>`sum(abs(${financialTransactions.amount}::numeric))`,
    transaction_count: sql<number>`count(*)`,
  })
    .from(financialTransactions)
    .where(and(...conditions))
    .groupBy(financialTransactions.category)
    .orderBy(sql`sum(abs(${financialTransactions.amount}::numeric)) desc`)

  const totalSpending = spending.reduce((sum, r) => sum + Number(r.amount), 0)

  // Prior period (same length) for comparison
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const periodDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
  const priorFrom = new Date(fromDate)
  priorFrom.setDate(priorFrom.getDate() - periodDays)
  const priorTo = new Date(fromDate)
  priorTo.setDate(priorTo.getDate() - 1)

  const priorConditions: any[] = [
    gte(financialTransactions.transactionDate, priorFrom.toISOString().slice(0, 10)),
    lte(financialTransactions.transactionDate, priorTo.toISOString().slice(0, 10)),
    lt(financialTransactions.amount, '0'),
    sql`${financialTransactions.transferPairId} is null`,
  ]
  if (filterAccountIds.length > 0) priorConditions.push(inArray(financialTransactions.accountId, filterAccountIds))

  const priorSpending = await db.select({
    category: financialTransactions.category,
    amount: sql<number>`sum(abs(${financialTransactions.amount}::numeric))`,
  })
    .from(financialTransactions)
    .where(and(...priorConditions))
    .groupBy(financialTransactions.category)

  const priorMap = new Map(priorSpending.map((r) => [r.category, Number(r.amount)]))

  // Top 10 biggest transactions in period
  const biggestTransactions = await db.select({
    id: financialTransactions.id,
    transactionDate: financialTransactions.transactionDate,
    descriptionRaw: financialTransactions.descriptionRaw,
    merchantName: financialTransactions.merchantName,
    amount: financialTransactions.amount,
    category: financialTransactions.category,
  })
    .from(financialTransactions)
    .where(and(
      gte(financialTransactions.transactionDate, from),
      lte(financialTransactions.transactionDate, to),
      lt(financialTransactions.amount, '0'),
      sql`${financialTransactions.transferPairId} is null`,
      ...(filterAccountIds.length > 0 ? [inArray(financialTransactions.accountId, filterAccountIds)] : []),
    ))
    .orderBy(sql`${financialTransactions.amount}::numeric asc`)
    .limit(10)

  return NextResponse.json({
    period: { from, to },
    categories: spending.map((r) => {
      const amount = Number(r.amount)
      const priorAmount = priorMap.get(r.category) || 0
      return {
        category: r.category || 'OTHER',
        amount,
        percentage: totalSpending > 0 ? Math.round((amount / totalSpending) * 100) : 0,
        transaction_count: Number(r.transaction_count),
        vs_prior_period: priorAmount > 0 ? Math.round(((amount - priorAmount) / priorAmount) * 100) : null,
      }
    }),
    total_spending: totalSpending,
    biggest_transactions: biggestTransactions,
  })
}
