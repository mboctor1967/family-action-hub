import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialStatements, financialAccounts, financialTransactions } from '@/lib/db/schema'
import { eq, sql, desc } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const statements = await db.select({
    id: financialStatements.id,
    fileName: financialStatements.fileName,
    bankName: financialStatements.bankName,
    statementStart: financialStatements.statementStart,
    statementEnd: financialStatements.statementEnd,
    openingBalance: financialStatements.openingBalance,
    closingBalance: financialStatements.closingBalance,
    sourceType: financialStatements.sourceType,
    needsReview: financialStatements.needsReview,
    importedAt: financialStatements.importedAt,
    accountId: financialStatements.accountId,
    accountBankName: financialAccounts.bankName,
    accountName: financialAccounts.accountName,
    accountNumber: financialAccounts.accountNumber,
    accountNumberLast4: financialAccounts.accountNumberLast4,
    transactionCount: sql<number>`(select count(*) from financial_transactions where statement_id = ${financialStatements.id})`,
  })
    .from(financialStatements)
    .leftJoin(financialAccounts, eq(financialStatements.accountId, financialAccounts.id))
    .orderBy(desc(financialStatements.importedAt))

  return NextResponse.json(statements)
}
