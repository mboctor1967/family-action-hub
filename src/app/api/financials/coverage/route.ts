import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialAccounts, financialStatements, financialTransactions } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get all accounts
  const allAccounts = await db.select().from(financialAccounts).orderBy(financialAccounts.bankName)

  // Find months that still contain duplicate transactions (same account, same date+amount+description).
  // Returned as a Set of `${account_id}|${YYYY-MM}` keys for O(1) lookup.
  const dupMonthsRaw = await db.execute(sql`
    SELECT account_id, to_char(transaction_date, 'YYYY-MM') AS ym
    FROM financial_transactions
    GROUP BY account_id, transaction_date, amount, description_raw, to_char(transaction_date, 'YYYY-MM')
    HAVING count(*) > 1
  `) as any
  const dupMonthKeys = new Set<string>(
    (dupMonthsRaw.rows ?? dupMonthsRaw ?? []).map((r: any) => `${r.account_id}|${r.ym}`)
  )

  // Get all statements with their periods + file info
  const statements = await db.select({
    id: financialStatements.id,
    fileName: financialStatements.fileName,
    accountId: financialStatements.accountId,
    statementStart: financialStatements.statementStart,
    statementEnd: financialStatements.statementEnd,
    needsReview: financialStatements.needsReview,
    sourceType: financialStatements.sourceType,
    importedAt: financialStatements.importedAt,
  })
    .from(financialStatements)
    .where(eq(financialStatements.isDuplicate, false))

  // Build coverage map grouped by Australian Financial Year (Jul–Jun).
  // Default: current FY + previous 2 FYs = 36 months starting Jul of (current FY - 2).
  const now = new Date()
  const currentFyStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1 // Jul-start
  const FY_COUNT = 3
  const months: string[] = []
  for (let fy = FY_COUNT - 1; fy >= 0; fy--) {
    const startYear = currentFyStartYear - fy
    for (let m = 6; m < 18; m++) {
      // Jul (month index 6) through Jun-of-next-year (month 17 → rolls to next year's Jun)
      const d = new Date(startYear, m, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
  }

  const coverage = allAccounts.map((account) => {
    const accountStatements = statements.filter((s) => s.accountId === account.id)

    const monthCoverage = months.map((month) => {
      const [year, mon] = month.split('-').map(Number)
      const monthStart = new Date(year, mon - 1, 1)
      const monthEnd = new Date(year, mon, 0) // last day of month

      // Check if this month is in the future
      if (monthStart > now) {
        return { month, status: 'future' as const }
      }

      // Check if any statement covers this month
      const covering = accountStatements.find((s) => {
        if (!s.statementStart || !s.statementEnd) return false
        const start = new Date(s.statementStart)
        const end = new Date(s.statementEnd)
        return start <= monthEnd && end >= monthStart
      })

      if (covering) {
        return {
          month,
          status: covering.needsReview ? 'needs_review' as const : 'imported' as const,
          has_duplicates: dupMonthKeys.has(`${account.id}|${month}`),
        }
      }

      return { month, status: 'missing' as const, has_duplicates: false }
    })

    // Per-statement coverage within the same month window
    const perStatement = accountStatements.map((s) => {
      const smCoverage = months.map((month) => {
        const [year, mon] = month.split('-').map(Number)
        const monthStart = new Date(year, mon - 1, 1)
        const monthEnd = new Date(year, mon, 0)
        if (monthStart > now) return { month, status: 'future' as const }
        if (!s.statementStart || !s.statementEnd) return { month, status: 'missing' as const }
        const start = new Date(s.statementStart)
        const end = new Date(s.statementEnd)
        if (start <= monthEnd && end >= monthStart) {
          return { month, status: s.needsReview ? ('needs_review' as const) : ('imported' as const) }
        }
        return { month, status: 'missing' as const }
      })
      return {
        id: s.id,
        file_name: s.fileName,
        source_type: s.sourceType,
        statement_start: s.statementStart,
        statement_end: s.statementEnd,
        imported_at: s.importedAt,
        needs_review: s.needsReview,
        months: smCoverage,
      }
    }).sort((a, b) => String(a.statement_start || '').localeCompare(String(b.statement_start || '')))

    return {
      account_id: account.id,
      bank_name: account.bankName,
      account_name: account.accountName,
      account_number_last4: account.accountNumberLast4,
      account_type: account.accountType,
      months: monthCoverage,
      statements: perStatement,
    }
  })

  return NextResponse.json({ coverage, months })
}
