import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialAccounts, financialStatements } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get all accounts
  const allAccounts = await db.select().from(financialAccounts).orderBy(financialAccounts.bankName)

  // Get all statements with their periods
  const statements = await db.select({
    accountId: financialStatements.accountId,
    statementStart: financialStatements.statementStart,
    statementEnd: financialStatements.statementEnd,
    needsReview: financialStatements.needsReview,
  })
    .from(financialStatements)
    .where(eq(financialStatements.isDuplicate, false))

  // Build coverage map: 24 months back
  const now = new Date()
  const months: string[] = []
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
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
        }
      }

      return { month, status: 'missing' as const }
    })

    return {
      account_id: account.id,
      bank_name: account.bankName,
      account_name: account.accountName,
      account_number_last4: account.accountNumberLast4,
      account_type: account.accountType,
      months: monthCoverage,
    }
  })

  return NextResponse.json({ coverage, months })
}
