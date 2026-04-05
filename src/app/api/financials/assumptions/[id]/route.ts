import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialAssumptions } from '@/lib/db/schema'
import { eq, and, ne } from 'drizzle-orm'

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
  if (body.fy !== undefined) allowedFields.fy = body.fy
  if (body.entityId !== undefined) allowedFields.entityId = body.entityId
  if (body.assumptionType !== undefined) allowedFields.assumptionType = body.assumptionType
  if (body.valueNumeric !== undefined) allowedFields.valueNumeric = body.valueNumeric
  if (body.valueText !== undefined) allowedFields.valueText = body.valueText
  if (body.rationale !== undefined) allowedFields.rationale = body.rationale
  if (body.approvedBy !== undefined) {
    allowedFields.approvedBy = body.approvedBy
    allowedFields.approvedDate = body.approvedBy ? new Date() : null
  }

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // If fy, entityId, or assumptionType changed, re-validate uniqueness
  if (allowedFields.fy || allowedFields.entityId || allowedFields.assumptionType) {
    const current = await db.query.financialAssumptions.findFirst({
      where: eq(financialAssumptions.id, id),
    })
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const checkFy = allowedFields.fy ?? current.fy
    const checkEntity = allowedFields.entityId ?? current.entityId
    const checkType = allowedFields.assumptionType ?? current.assumptionType

    const duplicate = await db.query.financialAssumptions.findFirst({
      where: and(
        eq(financialAssumptions.fy, checkFy),
        eq(financialAssumptions.entityId, checkEntity),
        eq(financialAssumptions.assumptionType, checkType),
        ne(financialAssumptions.id, id),
      ),
    })
    if (duplicate) {
      return NextResponse.json({ error: 'An assumption with this FY, entity, and type already exists' }, { status: 409 })
    }
  }

  allowedFields.updatedAt = new Date()

  const [updated] = await db.update(financialAssumptions)
    .set(allowedFields)
    .where(eq(financialAssumptions.id, id))
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

  await db.delete(financialAssumptions).where(eq(financialAssumptions.id, id))
  return NextResponse.json({ success: true })
}
