import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialTransactions, financialAccounts } from '@/lib/db/schema'
import { and, gte, lte, lt, sql, inArray } from 'drizzle-orm'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 })

  const now = new Date()
  const from = searchParams.get('from') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = searchParams.get('to') || now.toISOString().slice(0, 10)
  const accountIds = searchParams.get('account_ids')?.split(',').filter(Boolean) || []
  const entityIds = searchParams.get('entity_ids')?.split(',').filter(Boolean) || []
  const useAi = searchParams.get('use_ai') === '1'
  const includeTransfers = searchParams.get('include_transfers') === '1'

  // Resolve entity IDs to account IDs (same as spending route)
  let filterAccountIds: string[] = [...accountIds]
  if (entityIds.length > 0 && filterAccountIds.length === 0) {
    const entityAccounts = await db.select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(inArray(financialAccounts.entityId, entityIds))
    filterAccountIds = entityAccounts.map((a) => a.id)
    if (filterAccountIds.length === 0) {
      return NextResponse.json({ monthly: [], summary: { total: 0, txn_count: 0, avg_per_month: 0, avg_per_txn: 0, highest_month: null, lowest_month: null } })
    }
  }

  const conds: any[] = [
    gte(financialTransactions.transactionDate, from),
    lte(financialTransactions.transactionDate, to),
    lt(financialTransactions.amount, '0'),
    sql`${financialTransactions.transferPairId} is null`,
  ]

  if (!includeTransfers) {
    conds.push(sql`(${financialTransactions.category} is null or ${financialTransactions.category} <> 'TRANSFERS')`)
    if (useAi) {
      conds.push(sql`not (
        (${financialTransactions.category} is null or ${financialTransactions.category} = 'OTHER')
        and ${financialTransactions.aiSuggestedCategory} = 'TRANSFERS'
      )`)
    }
  }
  if (filterAccountIds.length > 0) conds.push(inArray(financialTransactions.accountId, filterAccountIds))

  // Category filter — same logic as drill-down
  if (useAi) {
    conds.push(sql`(
      (${financialTransactions.category} is not null and ${financialTransactions.category} <> 'OTHER' and ${financialTransactions.category} = ${category})
      or (
        (${financialTransactions.category} is null or ${financialTransactions.category} = 'OTHER')
        and ${financialTransactions.aiSuggestedCategory} = ${category}
      )
    )`)
  } else {
    conds.push(sql`${financialTransactions.category} = ${category}`)
  }

  // Monthly aggregate
  const monthExpr = sql<string>`to_char(${financialTransactions.transactionDate}, 'YYYY-MM')`
  const rows = (await db.select({
    month: monthExpr,
    amount: sql<number>`sum(abs(${financialTransactions.amount}::numeric))`,
    count: sql<number>`count(*)`,
  })
    .from(financialTransactions)
    .where(and(...conds))
    .groupBy(monthExpr)
    .orderBy(monthExpr)) as { month: string; amount: string | number; count: string | number }[]

  // Fill in missing months in the range so the chart has a continuous axis
  const start = new Date(from)
  const end = new Date(to)
  const byMonth = new Map(rows.map((r) => [r.month, { amount: Number(r.amount), count: Number(r.count) }]))
  const monthly: { month: string; amount: number; count: number }[] = []
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cur <= end) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
    const hit = byMonth.get(key)
    monthly.push({ month: key, amount: hit?.amount ?? 0, count: hit?.count ?? 0 })
    cur.setMonth(cur.getMonth() + 1)
  }

  const total = monthly.reduce((s, r) => s + r.amount, 0)
  const txnCount = monthly.reduce((s, r) => s + r.count, 0)
  const monthsWithActivity = monthly.filter((r) => r.amount > 0)
  const highest = monthsWithActivity.length ? monthsWithActivity.reduce((a, b) => (a.amount >= b.amount ? a : b)) : null
  const lowest = monthsWithActivity.length ? monthsWithActivity.reduce((a, b) => (a.amount <= b.amount ? a : b)) : null

  return NextResponse.json({
    monthly,
    summary: {
      total,
      txn_count: txnCount,
      avg_per_month: monthsWithActivity.length > 0 ? total / monthsWithActivity.length : 0,
      avg_per_txn: txnCount > 0 ? total / txnCount : 0,
      highest_month: highest,
      lowest_month: lowest,
    },
  })
}
