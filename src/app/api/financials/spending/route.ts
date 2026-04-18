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
  const now = new Date()
  const from = searchParams.get('from') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = searchParams.get('to') || now.toISOString().slice(0, 10)
  const accountIds = searchParams.get('account_ids')?.split(',').filter(Boolean) || []
  const entityIds = searchParams.get('entity_ids')?.split(',').filter(Boolean) || []
  const accountId = searchParams.get('account_id') // legacy
  const useAi = searchParams.get('use_ai') === '1'
  const includeTransfers = searchParams.get('include_transfers') === '1'

  // Resolve entity IDs to account IDs
  let filterAccountIds: string[] = [...accountIds]
  if (accountId && filterAccountIds.length === 0) filterAccountIds.push(accountId)
  if (entityIds.length > 0 && filterAccountIds.length === 0) {
    const entityAccounts = await db.select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(inArray(financialAccounts.entityId, entityIds))
    filterAccountIds = entityAccounts.map((a) => a.id)
    if (filterAccountIds.length === 0) {
      return NextResponse.json({ period: { from, to }, categories: [], total_spending: 0, biggest_transactions: [], flags: { use_ai: useAi, include_transfers: includeTransfers } })
    }
  }

  // Grouping key: confirmed category, falling back to AI suggestion when enabled.
  // Treat literal 'OTHER' and NULL both as "unconfirmed" so AI fallback can override.
  const groupExpr = useAi
    ? sql<string>`coalesce(nullif(${financialTransactions.category}, 'OTHER'), ${financialTransactions.aiSuggestedCategory}, 'OTHER')`
    : sql<string>`coalesce(${financialTransactions.category}, 'OTHER')`

  const baseConds = (fromDate: string, toDate: string) => {
    const c: any[] = [
      gte(financialTransactions.transactionDate, fromDate),
      lte(financialTransactions.transactionDate, toDate),
      lt(financialTransactions.amount, '0'), // debits only
      sql`${financialTransactions.transferPairId} is null`, // exclude paired transfers
    ]
    if (!includeTransfers) {
      // Exclude confirmed-TRANSFERS rows always, AND (when AI is on) rows where the effective
      // category lands on TRANSFERS via AI suggestion fallback.
      c.push(sql`(${financialTransactions.category} is null or ${financialTransactions.category} <> 'TRANSFERS')`)
      if (useAi) {
        c.push(sql`not (
          (${financialTransactions.category} is null or ${financialTransactions.category} = 'OTHER')
          and ${financialTransactions.aiSuggestedCategory} = 'TRANSFERS'
        )`)
      }
    }
    if (filterAccountIds.length > 0) c.push(inArray(financialTransactions.accountId, filterAccountIds))
    return c
  }

  const spending = await db.select({
    category: groupExpr,
    amount: sql<number>`sum(abs(${financialTransactions.amount}::numeric))`,
    transaction_count: sql<number>`count(*)`,
    ai_only_count: sql<number>`sum(case when (${financialTransactions.category} is null or ${financialTransactions.category} = 'OTHER') then 1 else 0 end)`,
    confirmed_count: sql<number>`sum(case when (${financialTransactions.category} is not null and ${financialTransactions.category} <> 'OTHER') then 1 else 0 end)`,
  })
    .from(financialTransactions)
    .where(and(...baseConds(from, to)))
    .groupBy(groupExpr)
    .orderBy(sql`sum(abs(${financialTransactions.amount}::numeric)) desc`)

  const totalSpending = spending.reduce((sum, r) => sum + Number(r.amount), 0)

  // Prior period
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const periodDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
  const priorFrom = new Date(fromDate); priorFrom.setDate(priorFrom.getDate() - periodDays)
  const priorTo = new Date(fromDate); priorTo.setDate(priorTo.getDate() - 1)

  const priorSpending = await db.select({
    category: groupExpr,
    amount: sql<number>`sum(abs(${financialTransactions.amount}::numeric))`,
  })
    .from(financialTransactions)
    .where(and(...baseConds(priorFrom.toISOString().slice(0, 10), priorTo.toISOString().slice(0, 10))))
    .groupBy(groupExpr)

  const priorMap = new Map(priorSpending.map((r) => [r.category, Number(r.amount)]))

  // Monthly breakdown per category for volatility metrics
  const monthExpr = sql<string>`to_char(${financialTransactions.transactionDate}, 'YYYY-MM')`
  const monthlyRows = await db.select({
    category: groupExpr,
    month: monthExpr,
    amount: sql<number>`sum(abs(${financialTransactions.amount}::numeric))`,
  })
    .from(financialTransactions)
    .where(and(...baseConds(from, to)))
    .groupBy(groupExpr, monthExpr) as { category: string; month: string; amount: string | number }[]

  // Count months in the selected window for sparsity math
  const fyStart = new Date(from)
  const fyEnd = new Date(to)
  const totalMonthsInRange = (() => {
    let n = 0
    const cur = new Date(fyStart.getFullYear(), fyStart.getMonth(), 1)
    while (cur <= fyEnd) { n++; cur.setMonth(cur.getMonth() + 1) }
    return Math.max(1, n)
  })()

  const byCategoryMonthly = new Map<string, { month: string; amount: number }[]>()
  for (const r of monthlyRows) {
    const k = r.category
    if (!byCategoryMonthly.has(k)) byCategoryMonthly.set(k, [])
    byCategoryMonthly.get(k)!.push({ month: r.month, amount: Number(r.amount) })
  }

  function volatilityFor(category: string): {
    cv: number
    peak_month_share: number
    active_months: number
    total_months: number
    peak_month: { month: string; amount: number } | null
    volatility_level: 'smooth' | 'mild' | 'lumpy'
  } {
    const rows = byCategoryMonthly.get(category) || []
    const active = rows.length
    if (active === 0) {
      return { cv: 0, peak_month_share: 0, active_months: 0, total_months: totalMonthsInRange, peak_month: null, volatility_level: 'smooth' }
    }
    const total = rows.reduce((s, r) => s + r.amount, 0)
    const peak = rows.reduce((a, b) => (a.amount >= b.amount ? a : b))
    const peakShare = total > 0 ? peak.amount / total : 0
    // Mean & stdev across the FULL range (missing months = $0) so a single-month spike gets the CV treatment
    const mean = total / totalMonthsInRange
    let sumSq = 0
    const filled = new Map(rows.map(r => [r.month, r.amount]))
    const cur = new Date(fyStart.getFullYear(), fyStart.getMonth(), 1)
    while (cur <= fyEnd) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
      const v = filled.get(key) || 0
      sumSq += (v - mean) ** 2
      cur.setMonth(cur.getMonth() + 1)
    }
    const stdev = Math.sqrt(sumSq / totalMonthsInRange)
    const cv = mean > 0 ? stdev / mean : 0
    let level: 'smooth' | 'mild' | 'lumpy' = 'smooth'
    if (peakShare > 0.5 || cv > 0.75) level = 'lumpy'
    else if (peakShare > 0.3) level = 'mild'
    return { cv, peak_month_share: peakShare, active_months: active, total_months: totalMonthsInRange, peak_month: peak, volatility_level: level }
  }

  // Top 10 biggest transactions in period
  const biggestTransactions = await db.select({
    id: financialTransactions.id,
    transactionDate: financialTransactions.transactionDate,
    descriptionRaw: financialTransactions.descriptionRaw,
    merchantName: financialTransactions.merchantName,
    amount: financialTransactions.amount,
    category: financialTransactions.category,
    aiSuggestedCategory: financialTransactions.aiSuggestedCategory,
  })
    .from(financialTransactions)
    .where(and(...baseConds(from, to)))
    .orderBy(sql`${financialTransactions.amount}::numeric asc`)
    .limit(10)

  return NextResponse.json({
    period: { from, to },
    categories: spending.map((r) => {
      const amount = Number(r.amount)
      const priorAmount = priorMap.get(r.category) || 0
      const confirmed = Number(r.confirmed_count)
      const aiOnly = Number(r.ai_only_count)
      const vol = volatilityFor(r.category || 'OTHER')
      return {
        category: r.category || 'OTHER',
        amount,
        percentage: totalSpending > 0 ? Math.round((amount / totalSpending) * 100) : 0,
        transaction_count: Number(r.transaction_count),
        confirmed_count: confirmed,
        ai_only_count: aiOnly,
        is_ai_only: useAi && confirmed === 0 && aiOnly > 0,
        vs_prior_period: priorAmount > 0 ? Math.round(((amount - priorAmount) / priorAmount) * 100) : null,
        volatility: vol,
      }
    }),
    total_spending: totalSpending,
    biggest_transactions: biggestTransactions,
    flags: { use_ai: useAi, include_transfers: includeTransfers },
  })
}
