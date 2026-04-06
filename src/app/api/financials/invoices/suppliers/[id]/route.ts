/**
 * PATCH /api/financials/invoices/suppliers/[id] — edit supplier config
 * DELETE /api/financials/invoices/suppliers/[id] — delete supplier + its invoices
 *
 * v0.1.3 — Invoice Reader Integration
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invoiceSuppliers, invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  const body = await request.json().catch(() => ({}))

  const fields: Record<string, any> = {}
  if (body.name !== undefined) fields.name = body.name
  if (body.entityId !== undefined) fields.entityId = body.entityId || null
  if (body.gmailLabel !== undefined) fields.gmailLabel = body.gmailLabel || null
  if (body.senderEmails !== undefined) fields.senderEmails = body.senderEmails
  if (body.keywords !== undefined) fields.keywords = body.keywords
  if (body.fy !== undefined) fields.fy = body.fy
  if (body.customStartDate !== undefined) fields.customStartDate = body.customStartDate || null
  if (body.customEndDate !== undefined) fields.customEndDate = body.customEndDate || null
  if (body.defaultAtoCode !== undefined) fields.defaultAtoCode = body.defaultAtoCode || null
  if (body.isActive !== undefined) fields.isActive = body.isActive
  fields.updatedAt = new Date()

  if (Object.keys(fields).length <= 1) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const [updated] = await db
    .update(invoiceSuppliers)
    .set(fields)
    .where(eq(invoiceSuppliers.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await context.params

  // Delete associated invoices first (no cascade FK)
  await db.delete(invoices).where(eq(invoices.supplierId, id))
  await db.delete(invoiceSuppliers).where(eq(invoiceSuppliers.id, id))

  return NextResponse.json({ ok: true })
}
