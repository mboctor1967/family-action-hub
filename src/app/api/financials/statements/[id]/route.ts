import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialStatements, financialTransactions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const statement = await db.query.financialStatements.findFirst({
    where: eq(financialStatements.id, id),
    with: {
      account: true,
      transactions: {
        orderBy: (t, { asc }) => [asc(t.transactionDate), asc(t.rowIndex)],
      },
    },
  })

  if (!statement) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(statement)
}

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
  if (body.accountId !== undefined) allowedFields.accountId = body.accountId || null
  if (body.needsReview !== undefined) allowedFields.needsReview = body.needsReview

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const [updated] = await db.update(financialStatements)
    .set(allowedFields)
    .where(eq(financialStatements.id, id))
    .returning()

  // Also update transactions' accountId if statement's account changed
  if (body.accountId !== undefined && updated) {
    await db.update(financialTransactions)
      .set({ accountId: body.accountId || null })
      .where(eq(financialTransactions.statementId, id))
  }

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

  // Transactions are cascade-deleted via FK
  await db.delete(financialStatements).where(eq(financialStatements.id, id))
  return NextResponse.json({ success: true })
}
