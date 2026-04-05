import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialTransactions, financialStatements, financialAccounts } from '@/lib/db/schema'
import { eq, and, gte, lte, sql, desc, inArray } from 'drizzle-orm'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const months = parseInt(searchParams.get('months') || '12', 10)
  const accountIds = searchParams.get('account_ids')?.split(',').filter(Boolean) || []
  const entityIds = searchParams.get('entity_ids')?.split(',').filter(Boolean) || []
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  // Legacy single params
  const singleAccountId = searchParams.get('account_id')
  const singleEntityId = searchParams.get('entity_id')
  if (singleAccountId && accountIds.length === 0) accountIds.push(singleAccountId)
  if (singleEntityId && entityIds.length === 0) entityIds.push(singleEntityId)

  // Resolve entity IDs to account IDs
  let filterAccountIds: string[] = [...accountIds]
  if (entityIds.length > 0 && accountIds.length === 0) {
    const entityAccounts = await db.select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(inArray(financialAccounts.entityId, entityIds))
    filterAccountIds = entityAccounts.map((a) => a.id)
    if (filterAccountIds.length === 0) {
      // No accounts in selected entities
      return NextResponse.json({ monthly: [], accounts: [], totals: { statements: 0, needs_review: 0 } })
    }
  }

  // Date range
  const startStr = fromParam || (() => {
    const d = new Date()
    d.setMonth(d.getMonth() - months)
    return d.toISOString().slice(0, 10)
  })()

  const conditions: any[] = [
    gte(financialTransactions.transactionDate, startStr),
    sql`${financialTransactions.transferPairId} is null`, // exclude confirmed transfers
  ]
  if (toParam) conditions.push(lte(financialTransactions.transactionDate, toParam))
  if (filterAccountIds.length > 0) conditions.push(inArray(financialTransactions.accountId, filterAccountIds))

  const monthlyData = await db.select({
    month: sql<string>`to_char(${financialTransactions.transactionDate}, 'YYYY-MM')`,
    income: sql<number>`coalesce(sum(case when ${financialTransactions.amount}::numeric > 0 then ${financialTransactions.amount}::numeric else 0 end), 0)`,
    expenses: sql<number>`coalesce(sum(case when ${financialTransactions.amount}::numeric < 0 then abs(${financialTransactions.amount}::numeric) else 0 end), 0)`,
  })
    .from(financialTransactions)
    .where(and(...conditions))
    .groupBy(sql`to_char(${financialTransactions.transactionDate}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${financialTransactions.transactionDate}, 'YYYY-MM')`)

  const monthlySummary = monthlyData.map((row) => {
    const income = Number(row.income)
    const expenses = Number(row.expenses)
    const net = income - expenses
    return {
      month: row.month,
      income,
      expenses,
      net,
      savings_rate: income > 0 ? Math.round((net / income) * 100) : 0,
    }
  })

  // Per-account latest closing balances
  const accountBalances = await db.select({
    accountId: financialAccounts.id,
    bankName: financialAccounts.bankName,
    accountName: financialAccounts.accountName,
    accountNumberLast4: financialAccounts.accountNumberLast4,
    accountType: financialAccounts.accountType,
    owner: financialAccounts.owner,
    closingBalance: financialStatements.closingBalance,
    statementEnd: financialStatements.statementEnd,
  })
    .from(financialAccounts)
    .leftJoin(
      financialStatements,
      and(
        eq(financialStatements.accountId, financialAccounts.id),
        eq(financialStatements.isDuplicate, false)
      )
    )
    .orderBy(financialAccounts.bankName, desc(financialStatements.statementEnd))

  // Deduplicate to get only the latest statement per account
  const latestByAccount = new Map<string, typeof accountBalances[0]>()
  for (const row of accountBalances) {
    if (!latestByAccount.has(row.accountId)) {
      latestByAccount.set(row.accountId, row)
    }
  }

  // Total counts
  const totalStatements = await db.select({
    count: sql<number>`count(*)`,
    needsReview: sql<number>`count(*) filter (where ${financialStatements.needsReview} = true)`,
  }).from(financialStatements)

  return NextResponse.json({
    monthly: monthlySummary,
    accounts: Array.from(latestByAccount.values()),
    totals: {
      statements: Number(totalStatements[0]?.count || 0),
      needs_review: Number(totalStatements[0]?.needsReview || 0),
    },
  })
}
