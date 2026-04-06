/**
 * GET   /api/financials/invoices/[id] — get invoice detail
 * PATCH /api/financials/invoices/[id] — edit invoice (ATO code, linked txn, status)
 *
 * v0.1.3 — Invoice Reader Integration
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1)
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(invoice)
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  const body = await request.json().catch(() => ({}))

  const fields: Record<string, any> = {}
  if (body.atoCode !== undefined) fields.atoCode = body.atoCode || null
  if (body.linkedTxnId !== undefined) fields.linkedTxnId = body.linkedTxnId || null
  if (body.status !== undefined) fields.status = body.status
  if (body.invoiceNumber !== undefined) fields.invoiceNumber = body.invoiceNumber
  if (body.totalAmount !== undefined) fields.totalAmount = body.totalAmount !== null ? String(body.totalAmount) : null
  if (body.gstAmount !== undefined) fields.gstAmount = body.gstAmount !== null ? String(body.gstAmount) : null
  if (body.supplierName !== undefined) fields.supplierName = body.supplierName
  fields.updatedAt = new Date()

  const [updated] = await db
    .update(invoices)
    .set(fields)
    .where(eq(invoices.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}
