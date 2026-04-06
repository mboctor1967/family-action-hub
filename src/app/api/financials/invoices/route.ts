/**
 * GET /api/financials/invoices — list invoices with filters
 *
 * Query params: supplierId, entityId, fy, status, limit, offset
 *
 * v0.1.3 — Invoice Reader Integration
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invoices, invoiceSuppliers } from '@/lib/db/schema'
import { eq, and, desc, sql, type SQL } from 'drizzle-orm'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const supplierId = url.searchParams.get('supplierId')
  const entityId = url.searchParams.get('entityId')
  const fy = url.searchParams.get('fy')
  const status = url.searchParams.get('status')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

  const conditions: SQL[] = []
  if (supplierId) conditions.push(eq(invoices.supplierId, supplierId))
  if (entityId) conditions.push(eq(invoices.entityId, entityId))
  if (fy) conditions.push(eq(invoices.fy, fy))
  if (status) conditions.push(eq(invoices.status, status))

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select()
    .from(invoices)
    .where(where)
    .orderBy(desc(invoices.sourceEmailDate), desc(invoices.createdAt))
    .limit(limit)
    .offset(offset)

  const [countRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(invoices)
    .where(where)

  return NextResponse.json({
    invoices: rows,
    total: Number(countRow?.n ?? 0),
    limit,
    offset,
  })
}
