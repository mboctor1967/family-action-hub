import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialAccounts, financialStatements, financialTransactions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()

  const allowedFields: Record<string, any> = {}
  if (body.accountName !== undefined) allowedFields.accountName = body.accountName
  if (body.accountNumber !== undefined) {
    allowedFields.accountNumber = body.accountNumber
    // Auto-derive last4 from full account number
    const digits = body.accountNumber.replace(/\D/g, '')
    if (digits.length >= 4) allowedFields.accountNumberLast4 = digits.slice(-4)
  }
  if (body.accountNumberLast4 !== undefined && !body.accountNumber) allowedFields.accountNumberLast4 = body.accountNumberLast4
  if (body.bsb !== undefined) allowedFields.bsb = body.bsb
  if (body.accountType !== undefined) allowedFields.accountType = body.accountType
  if (body.entityId !== undefined) allowedFields.entityId = body.entityId || null
  if (body.bankName !== undefined) allowedFields.bankName = body.bankName

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const [updated] = await db.update(financialAccounts)
    .set(allowedFields)
    .where(eq(financialAccounts.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Delete transactions, then statements, then the account
  await db.delete(financialTransactions).where(eq(financialTransactions.accountId, id))
  await db.delete(financialStatements).where(eq(financialStatements.accountId, id))
  await db.delete(financialAccounts).where(eq(financialAccounts.id, id))

  return NextResponse.json({ success: true })
}
