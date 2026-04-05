import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialTransactions, financialAccounts } from '@/lib/db/schema'
import { sql, eq, isNull, and } from 'drizzle-orm'
import { randomUUID } from 'crypto'

// GET — detect potential transfer pairs (dry run, doesn't modify DB)
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get all transactions that aren't already marked as part of a transfer pair
  // and aren't already categorized as transfers
  const rows = await db.select({
    id: financialTransactions.id,
    date: financialTransactions.transactionDate,
    amount: financialTransactions.amount,
    description: financialTransactions.descriptionRaw,
    merchantName: financialTransactions.merchantName,
    accountId: financialTransactions.accountId,
    accountName: financialAccounts.accountName,
    accountNumberLast4: financialAccounts.accountNumberLast4,
    bankName: financialAccounts.bankName,
    entityId: financialAccounts.entityId,
  })
    .from(financialTransactions)
    .leftJoin(financialAccounts, eq(financialTransactions.accountId, financialAccounts.id))
    .where(and(
      isNull(financialTransactions.transferPairId),
      sql`${financialTransactions.category} is null or ${financialTransactions.category} != 'TRANSFERS'`,
    ))

  // Build a map of debit rows (negative amounts) and credit rows (positive amounts)
  const debits: typeof rows = []
  const credits: typeof rows = []
  for (const row of rows) {
    const amt = Number(row.amount)
    if (amt < 0) debits.push(row)
    else if (amt > 0) credits.push(row)
  }

  // Match debits to credits: same absolute amount, date within ±1 day, different accounts
  const proposals: Array<{
    debit: typeof rows[0]
    credit: typeof rows[0]
    sameEntity: boolean
    confidence: 'high' | 'medium' | 'low'
  }> = []

  const usedIds = new Set<string>()

  // Sort debits by absolute amount desc — match biggest first (unique matches most reliable)
  debits.sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))

  for (const debit of debits) {
    if (usedIds.has(debit.id)) continue
    const absAmt = Math.abs(Number(debit.amount))
    const debitDate = new Date(debit.date)

    // Find matching credits
    const matches = credits.filter((credit) => {
      if (usedIds.has(credit.id)) return false
      if (credit.accountId === debit.accountId) return false
      if (Number(credit.amount) !== absAmt) return false
      const creditDate = new Date(credit.date)
      const daysDiff = Math.abs((creditDate.getTime() - debitDate.getTime()) / (1000 * 60 * 60 * 24))
      return daysDiff <= 1
    })

    if (matches.length === 0) continue

    // Prefer same-entity match
    const sameEntityMatch = matches.find((m) => m.entityId && debit.entityId && m.entityId === debit.entityId)
    const credit = sameEntityMatch || matches[0]

    const sameEntity = debit.entityId === credit.entityId && debit.entityId !== null
    const exactDate = debit.date === credit.date
    const confidence: 'high' | 'medium' | 'low' =
      sameEntity && exactDate ? 'high' :
      sameEntity || exactDate ? 'medium' :
      'low'

    proposals.push({ debit, credit, sameEntity, confidence })
    usedIds.add(debit.id)
    usedIds.add(credit.id)
  }

  return NextResponse.json({
    total: proposals.length,
    high: proposals.filter(p => p.confidence === 'high').length,
    medium: proposals.filter(p => p.confidence === 'medium').length,
    low: proposals.filter(p => p.confidence === 'low').length,
    proposals,
  })
}

// POST — confirm one or more transfer pairs
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { pairs } = await request.json() as {
    pairs: Array<{ debitId: string; creditId: string }>
  }

  if (!pairs?.length) return NextResponse.json({ error: 'No pairs to confirm' }, { status: 400 })

  let confirmed = 0
  for (const pair of pairs) {
    const pairId = randomUUID()
    const result = await db.update(financialTransactions)
      .set({
        transferPairId: pairId,
        category: 'TRANSFERS',
      })
      .where(sql`${financialTransactions.id} in (${sql.raw(`'${pair.debitId}'`)}, ${sql.raw(`'${pair.creditId}'`)})`)
      .returning({ id: financialTransactions.id })
    if (result.length === 2) confirmed++
  }

  return NextResponse.json({ success: true, confirmed })
}

// DELETE — unlink a transfer pair (mark as not a transfer)
export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { pairId } = await request.json() as { pairId: string }
  if (!pairId) return NextResponse.json({ error: 'pairId required' }, { status: 400 })

  await db.update(financialTransactions)
    .set({ transferPairId: null, category: 'OTHER' })
    .where(eq(financialTransactions.transferPairId, pairId))

  return NextResponse.json({ success: true })
}
