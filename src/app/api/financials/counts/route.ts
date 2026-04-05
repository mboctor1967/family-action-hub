import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialTransactions, financialAccounts } from '@/lib/db/schema'
import { and, eq, gte, lte, sql, inArray } from 'drizzle-orm'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const accountIds = searchParams.get('account_ids')?.split(',').filter(Boolean) || []
  const entityIds = searchParams.get('entity_ids')?.split(',').filter(Boolean) || []
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // Resolve entities to accounts
  let filterAccountIds = [...accountIds]
  if (entityIds.length > 0 && accountIds.length === 0) {
    const entityAccounts = await db.select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(inArray(financialAccounts.entityId, entityIds))
    filterAccountIds = entityAccounts.map((a) => a.id)
  }

  const conditions: any[] = []
  if (filterAccountIds.length > 0) conditions.push(inArray(financialTransactions.accountId, filterAccountIds))
  if (from) conditions.push(gte(financialTransactions.transactionDate, from))
  if (to) conditions.push(lte(financialTransactions.transactionDate, to))

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const result = await db.select({
    total: sql<number>`count(*)`,
    income: sql<number>`count(*) filter (where ${financialTransactions.amount}::numeric > 0 and ${financialTransactions.transferPairId} is null)`,
    expenses: sql<number>`count(*) filter (where ${financialTransactions.amount}::numeric < 0 and ${financialTransactions.transferPairId} is null)`,
    total_income: sql<number>`coalesce(sum(${financialTransactions.amount}::numeric) filter (where ${financialTransactions.amount}::numeric > 0 and ${financialTransactions.transferPairId} is null), 0)`,
    total_spend: sql<number>`coalesce(sum(abs(${financialTransactions.amount}::numeric)) filter (where ${financialTransactions.amount}::numeric < 0 and ${financialTransactions.transferPairId} is null), 0)`,
    uncategorized: sql<number>`count(*) filter (where (${financialTransactions.category} = 'OTHER' or ${financialTransactions.category} is null) and ${financialTransactions.transferPairId} is null)`,
    unique_merchants: sql<number>`count(distinct ${financialTransactions.merchantName})`,
    transfers: sql<number>`count(*) filter (where ${financialTransactions.transferPairId} is not null)`,
  })
    .from(financialTransactions)
    .where(whereClause)

  return NextResponse.json(result[0])
}
