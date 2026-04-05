/**
 * PUT /api/financials/tax/invoices/[gdriveFileId]
 *
 * Upsert an invoice tag: supplier, amount, ATO codes, linked transaction.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invoiceTags } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

type RouteContext = { params: Promise<{ gdriveFileId: string }> }

interface TagBody {
  entityId: string
  fy: string
  filename: string
  supplier?: string | null
  amount?: number | null
  atoCodePersonal?: string | null
  atoCodeCompany?: string | null
  linkedTxnId?: string | null
  matchStatus?: 'matched' | 'unmatched' | 'verified'
  notes?: string | null
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { gdriveFileId } = await context.params
  const body = (await request.json().catch(() => ({}))) as Partial<TagBody>

  if (!body.entityId || !body.fy || !body.filename) {
    return NextResponse.json({ error: 'entityId, fy, filename are required' }, { status: 400 })
  }

  const matchStatus = body.matchStatus ?? (body.linkedTxnId ? 'matched' : 'unmatched')

  const existing = await db
    .select()
    .from(invoiceTags)
    .where(eq(invoiceTags.gdriveFileId, gdriveFileId))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(invoiceTags)
      .set({
        entityId: body.entityId,
        fy: body.fy,
        filename: body.filename,
        supplier: body.supplier ?? null,
        amount: body.amount !== undefined && body.amount !== null ? String(body.amount) : null,
        atoCodePersonal: body.atoCodePersonal ?? null,
        atoCodeCompany: body.atoCodeCompany ?? null,
        linkedTxnId: body.linkedTxnId ?? null,
        matchStatus,
        notes: body.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(invoiceTags.gdriveFileId, gdriveFileId))
  } else {
    await db.insert(invoiceTags).values({
      gdriveFileId,
      entityId: body.entityId,
      fy: body.fy,
      filename: body.filename,
      supplier: body.supplier ?? null,
      amount: body.amount !== undefined && body.amount !== null ? String(body.amount) : null,
      atoCodePersonal: body.atoCodePersonal ?? null,
      atoCodeCompany: body.atoCodeCompany ?? null,
      linkedTxnId: body.linkedTxnId ?? null,
      matchStatus,
      notes: body.notes ?? null,
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { gdriveFileId } = await context.params
  await db.delete(invoiceTags).where(eq(invoiceTags.gdriveFileId, gdriveFileId))
  return NextResponse.json({ ok: true })
}
