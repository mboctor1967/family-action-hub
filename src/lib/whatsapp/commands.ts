import { db } from '@/lib/db'
import { financialTransactions, financialAccounts, financialStatements } from '@/lib/db/schema'
import { and, desc, eq, gte, lte, sql, isNull } from 'drizzle-orm'
import { formatSpend, formatBalance, formatRecent } from './formatters'

const UNKNOWN = 'Unknown command. Try: spend, balance, recent'

export async function handleCommand(cmd: string): Promise<string> {
  switch (cmd) {
    case 'spend': return await spend()
    case 'balance': return await balance()
    case 'recent': return await recent()
    default: return UNKNOWN
  }
}

function currentMonthRange(): { start: string; end: string; label: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = new Date(y, m, 1).toISOString().slice(0, 10)
  const end = new Date(y, m + 1, 0).toISOString().slice(0, 10)
  const label = now.toLocaleString('en-AU', { month: 'long', year: 'numeric' })
  return { start, end, label }
}

async function spend(): Promise<string> {
  const { start, end, label } = currentMonthRange()
  const rows = await db.select({
    categoryName: financialTransactions.category,
    amount: sql<number>`coalesce(sum(case when ${financialTransactions.amount}::numeric < 0 then abs(${financialTransactions.amount}::numeric) else 0 end), 0)`,
  })
    .from(financialTransactions)
    .where(and(
      gte(financialTransactions.transactionDate, start),
      lte(financialTransactions.transactionDate, end),
      isNull(financialTransactions.transferPairId),
    ))
    .groupBy(financialTransactions.category)

  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  const topCategories = rows
    .filter((r) => Number(r.amount) > 0)
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 3)
    .map((r) => ({ name: r.categoryName ?? 'Uncategorised', amount: Number(r.amount) }))

  return formatSpend({ monthLabel: label, total, topCategories })
}

async function balance(): Promise<string> {
  const rows = await db.select({
    bankName: financialAccounts.bankName,
    accountName: financialAccounts.accountName,
    closingBalance: financialStatements.closingBalance,
    statementEnd: financialStatements.statementEnd,
  })
    .from(financialAccounts)
    .leftJoin(
      financialStatements,
      and(eq(financialStatements.accountId, financialAccounts.id), eq(financialStatements.isDuplicate, false)),
    )
    .orderBy(financialAccounts.bankName, desc(financialStatements.statementEnd))

  const latest = new Map<string, { label: string; balance: number }>()
  for (const r of rows) {
    const key = `${r.bankName}|${r.accountName}`
    if (!latest.has(key) && r.closingBalance !== null && r.closingBalance !== undefined) {
      latest.set(key, {
        label: `${r.bankName} ${r.accountName ?? ''}`.trim(),
        balance: Number(r.closingBalance),
      })
    }
  }
  return formatBalance(Array.from(latest.values()))
}

async function recent(): Promise<string> {
  const rows = await db.select({
    date: financialTransactions.transactionDate,
    amount: financialTransactions.amount,
    merchant: financialTransactions.merchantName,
    categoryName: financialTransactions.category,
  })
    .from(financialTransactions)
    .where(isNull(financialTransactions.transferPairId))
    .orderBy(desc(financialTransactions.transactionDate))
    .limit(5)

  return formatRecent(rows.map((r) => ({
    date: String(r.date),
    amount: Number(r.amount),
    merchant: r.merchant ?? '',
    category: r.categoryName,
  })))
}
