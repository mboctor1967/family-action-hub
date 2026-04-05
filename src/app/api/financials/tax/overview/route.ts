/**
 * GET /api/financials/tax/overview?fy=...
 *
 * Per-entity summary for the Tax Prep Overview tab.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  financialEntities,
  financialAccounts,
  financialTransactions,
} from '@/lib/db/schema'
import { and, eq, sql, gte, lte, isNull, isNotNull } from 'drizzle-orm'
import { parseFy } from '@/lib/financials/tax-export/queries'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const fyParam = url.searchParams.get('fy')
  if (!fyParam) return NextResponse.json({ error: 'fy is required' }, { status: 400 })

  let fy
  try {
    fy = parseFy(fyParam)
  } catch {
    return NextResponse.json({ error: 'Invalid fy format' }, { status: 400 })
  }

  const entities = await db
    .select()
    .from(financialEntities)
    .orderBy(financialEntities.sortOrder)

  const summaries = await Promise.all(
    entities.map(async (entity) => {
      // Per-entity aggregates via account join
      const agg = await db
        .select({
          txnCount: sql<number>`count(*)`,
          incomeSum: sql<number>`coalesce(sum(case when ${financialTransactions.amount}::numeric > 0 then ${financialTransactions.amount}::numeric else 0 end), 0)`,
          expenseSum: sql<number>`coalesce(sum(case when ${financialTransactions.amount}::numeric < 0 then abs(${financialTransactions.amount}::numeric) else 0 end), 0)`,
          deductibleSum: sql<number>`coalesce(sum(case when ${financialTransactions.isTaxDeductible} = true and ${financialTransactions.amount}::numeric < 0 then abs(${financialTransactions.amount}::numeric) else 0 end), 0)`,
        })
        .from(financialTransactions)
        .innerJoin(financialAccounts, eq(financialTransactions.accountId, financialAccounts.id))
        .where(
          and(
            eq(financialAccounts.entityId, entity.id),
            gte(financialTransactions.transactionDate, fy.startDate),
            lte(financialTransactions.transactionDate, fy.endDate),
            isNull(financialTransactions.transferPairId)
          )
        )

      // Unreviewed ATO codes (has AI suggestion but no confirmed value for this entity scope)
      const isCompany = entity.type === 'business' || entity.type === 'trust'
      const unreviewedCol = isCompany
        ? sql`${financialTransactions.atoCodeCompany} is null and ${financialTransactions.aiSuggestedAtoCodeCompany} is not null`
        : sql`${financialTransactions.atoCodePersonal} is null and ${financialTransactions.aiSuggestedAtoCodePersonal} is not null`

      const [unreviewedRow] = await db
        .select({ n: sql<number>`count(*)` })
        .from(financialTransactions)
        .innerJoin(financialAccounts, eq(financialTransactions.accountId, financialAccounts.id))
        .where(
          and(
            eq(financialAccounts.entityId, entity.id),
            gte(financialTransactions.transactionDate, fy.startDate),
            lte(financialTransactions.transactionDate, fy.endDate),
            isNull(financialTransactions.transferPairId),
            unreviewedCol
          )
        )

      return {
        id: entity.id,
        name: entity.name,
        type: entity.type as 'personal' | 'business' | 'trust',
        transactionCount: Number(agg[0]?.txnCount ?? 0),
        totalIncome: Number(agg[0]?.incomeSum ?? 0),
        totalExpenses: Number(agg[0]?.expenseSum ?? 0),
        totalDeductible: Number(agg[0]?.deductibleSum ?? 0),
        unreviewedCount: Number(unreviewedRow?.n ?? 0),
        outstandingCount: 0, // populated during export, simplified here
      }
    })
  )

  return NextResponse.json({ entities: summaries, fy: fyParam })
}
