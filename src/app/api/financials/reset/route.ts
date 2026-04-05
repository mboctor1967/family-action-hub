import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialTransactions, financialStatements, financialAccounts, parseErrors } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { scope } = body as { scope?: 'all' | 'transactions' | 'statements' | 'errors' }

  const counts: Record<string, number> = {}

  if (scope === 'all' || scope === 'transactions' || !scope) {
    const txnResult = await db.delete(financialTransactions).returning({ id: financialTransactions.id })
    counts.transactions = txnResult.length
  }

  if (scope === 'all' || scope === 'statements') {
    const stmtResult = await db.delete(financialStatements).returning({ id: financialStatements.id })
    counts.statements = stmtResult.length
  }

  if (scope === 'all') {
    const acctResult = await db.delete(financialAccounts).returning({ id: financialAccounts.id })
    counts.accounts = acctResult.length
  }

  if (scope === 'all' || scope === 'errors') {
    const errResult = await db.delete(parseErrors).returning({ id: parseErrors.id })
    counts.errors = errResult.length
  }

  return NextResponse.json({ success: true, deleted: counts })
}
