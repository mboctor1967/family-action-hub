import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialTransactions, financialAccounts } from '@/lib/db/schema'
import { eq, and, sql, desc } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Find all subscription transactions grouped by merchant + account
  const subscriptions = await db.select({
    merchantName: financialTransactions.merchantName,
    accountId: financialTransactions.accountId,
    accountName: financialAccounts.accountName,
    bankName: financialAccounts.bankName,
    frequency: financialTransactions.subscriptionFrequency,
    avgAmount: sql<number>`round(avg(abs(${financialTransactions.amount}::numeric)), 2)`,
    count: sql<number>`count(*)`,
    lastCharged: sql<string>`max(${financialTransactions.transactionDate})`,
    latestAmount: sql<number>`abs((array_agg(${financialTransactions.amount}::numeric order by ${financialTransactions.transactionDate} desc))[1])`,
  })
    .from(financialTransactions)
    .leftJoin(financialAccounts, eq(financialTransactions.accountId, financialAccounts.id))
    .where(eq(financialTransactions.isSubscription, true))
    .groupBy(
      financialTransactions.merchantName,
      financialTransactions.accountId,
      financialTransactions.subscriptionFrequency,
      financialAccounts.accountName,
      financialAccounts.bankName,
    )
    .orderBy(desc(sql`avg(abs(${financialTransactions.amount}::numeric))`))

  // Calculate annual costs and detect cross-account duplicates
  const merchantAccounts = new Map<string, Set<string>>()
  for (const sub of subscriptions) {
    const key = (sub.merchantName || '').toLowerCase()
    if (!merchantAccounts.has(key)) merchantAccounts.set(key, new Set())
    if (sub.accountId) merchantAccounts.get(key)!.add(sub.accountId)
  }

  const results = subscriptions.map((sub) => {
    const amount = Number(sub.latestAmount || sub.avgAmount)
    const freq = sub.frequency || 'monthly'
    const annualMultiplier = freq === 'weekly' ? 52 : freq === 'annual' ? 1 : 12
    const merchantKey = (sub.merchantName || '').toLowerCase()

    return {
      merchant_name: sub.merchantName || 'Unknown',
      account_name: sub.accountName || sub.bankName || 'Unknown',
      account_id: sub.accountId,
      amount,
      frequency: freq,
      estimated_annual_cost: Math.round(amount * annualMultiplier * 100) / 100,
      last_charged: sub.lastCharged,
      occurrence_count: Number(sub.count),
      is_duplicate_across_accounts: (merchantAccounts.get(merchantKey)?.size || 0) > 1,
    }
  })

  const totalMonthly = results.reduce((sum, s) => {
    const freq = s.frequency
    const monthly = freq === 'weekly' ? s.amount * 4.33 : freq === 'annual' ? s.amount / 12 : s.amount
    return sum + monthly
  }, 0)

  return NextResponse.json({
    subscriptions: results,
    total_monthly: Math.round(totalMonthly * 100) / 100,
    total_annual: Math.round(totalMonthly * 12 * 100) / 100,
  })
}
