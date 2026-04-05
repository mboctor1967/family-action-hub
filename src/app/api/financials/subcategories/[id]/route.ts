/**
 * /api/financials/subcategories/[id]
 *
 * Targeted edits on a single subcategory (name, sort order, ATO codes).
 * Used by the Category Manager page to update per-subcategory ATO mappings
 * without replacing the whole category's subcategory list.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialSubcategories } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => ({}))

  const fields: Record<string, any> = {}
  if (body.name !== undefined) fields.name = String(body.name).trim()
  if (body.sortOrder !== undefined) fields.sortOrder = Number(body.sortOrder)
  if (body.atoCodePersonal !== undefined) fields.atoCodePersonal = body.atoCodePersonal || null
  if (body.atoCodeCompany !== undefined) fields.atoCodeCompany = body.atoCodeCompany || null

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const [updated] = await db
    .update(financialSubcategories)
    .set(fields)
    .where(eq(financialSubcategories.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  await db.delete(financialSubcategories).where(eq(financialSubcategories.id, id))
  return NextResponse.json({ ok: true })
}
