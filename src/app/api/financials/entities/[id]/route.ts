import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialEntities, financialAccounts } from '@/lib/db/schema'
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
  if (body.name !== undefined) allowedFields.name = body.name
  if (body.type !== undefined) allowedFields.type = body.type
  if (body.color !== undefined) allowedFields.color = body.color
  if (body.invoiceDriveFolder !== undefined) allowedFields.invoiceDriveFolder = body.invoiceDriveFolder || null

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const [updated] = await db.update(financialEntities)
    .set(allowedFields)
    .where(eq(financialEntities.id, id))
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

  // Unlink accounts from this entity first (set entityId to null)
  await db.update(financialAccounts)
    .set({ entityId: null })
    .where(eq(financialAccounts.entityId, id))

  await db.delete(financialEntities).where(eq(financialEntities.id, id))
  return NextResponse.json({ success: true })
}
