import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialTransactions } from '@/lib/db/schema'
import { and, eq, gte, lte, sql } from 'drizzle-orm'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  // Australian FY: fy=2025 means Jul 2025 - Jun 2026
  const fyYear = parseInt(searchParams.get('fy') || String(new Date().getFullYear()), 10)
  const fyStart = `${fyYear}-07-01`
  const fyEnd = `${fyYear + 1}-06-30`

  // Tax-deductible transactions grouped by tax_category
  const byCategory = await db.select({
    taxCategory: financialTransactions.taxCategory,
    total: sql<number>`sum(abs(${financialTransactions.amount}::numeric))`,
    count: sql<number>`count(*)`,
  })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.isTaxDeductible, true),
      gte(financialTransactions.transactionDate, fyStart),
      lte(financialTransactions.transactionDate, fyEnd),
    ))
    .groupBy(financialTransactions.taxCategory)

  // All tax-deductible transactions for the period
  const transactions = await db.select({
    id: financialTransactions.id,
    transactionDate: financialTransactions.transactionDate,
    descriptionRaw: financialTransactions.descriptionRaw,
    merchantName: financialTransactions.merchantName,
    amount: financialTransactions.amount,
    category: financialTransactions.category,
    taxCategory: financialTransactions.taxCategory,
  })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.isTaxDeductible, true),
      gte(financialTransactions.transactionDate, fyStart),
      lte(financialTransactions.transactionDate, fyEnd),
    ))
    .orderBy(financialTransactions.transactionDate)

  const summary = {
    work_expenses: 0,
    donations: 0,
    investment: 0,
    total: 0,
  }

  for (const row of byCategory) {
    const amount = Number(row.total)
    if (row.taxCategory === 'work_expense') summary.work_expenses = amount
    else if (row.taxCategory === 'donation') summary.donations = amount
    else if (row.taxCategory === 'investment') summary.investment = amount
    summary.total += amount
  }

  return NextResponse.json({
    financial_year: `FY${fyYear}/${fyYear + 1}`,
    period: { from: fyStart, to: fyEnd },
    summary,
    by_category: byCategory,
    transactions,
  })
}
