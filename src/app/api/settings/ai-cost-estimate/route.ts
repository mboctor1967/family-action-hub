/**
 * GET /api/settings/ai-cost-estimate
 *
 * Live cost estimate for the Claude ATO toggle in Settings.
 * Recomputed on every call (not cached).
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialTransactions } from '@/lib/db/schema'
import { isNull, sql, and, gte } from 'drizzle-orm'
import { CLAUDE_PRICING, estimateCosts } from '@/lib/financials/ai-cost'
import { isClaudeAtoEnabled } from '@/lib/app-settings'
import type { AiCostEstimate } from '@/types/financials'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const enabled = await isClaudeAtoEnabled()

  // Monthly average: count txns created in the last 90 days, divide by 3
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const [monthlyRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(financialTransactions)
    .where(gte(financialTransactions.createdAt, ninetyDaysAgo))
  const monthlyAvg = Math.round(Number(monthlyRow?.n ?? 0) / 3)

  // Backfill count: txns with null suggestions in BOTH columns
  let backfillCount: number | null = null
  if (!enabled) {
    const [backfillRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(financialTransactions)
      .where(
        and(
          isNull(financialTransactions.aiSuggestedAtoCodePersonal),
          isNull(financialTransactions.aiSuggestedAtoCodeCompany)
        )
      )
    backfillCount = Number(backfillRow?.n ?? 0)
  }

  const estimate = estimateCosts(monthlyAvg, backfillCount)

  const response: AiCostEstimate = {
    model: CLAUDE_PRICING.model,
    pricing: {
      inputPer1M: CLAUDE_PRICING.inputPer1M,
      outputPer1M: CLAUDE_PRICING.outputPer1M,
      currency: CLAUDE_PRICING.currency,
      asOf: CLAUDE_PRICING.asOf,
    },
    estimates: estimate,
    currentSetting: { enabled },
  }

  return NextResponse.json(response)
}
