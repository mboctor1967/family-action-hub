/**
 * GET  /api/financials/invoices/suppliers — list all supplier configs
 * POST /api/financials/invoices/suppliers — create a new supplier config
 *
 * v0.1.3 — Invoice Reader Integration
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invoiceSuppliers, financialEntities } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const suppliers = await db.query.invoiceSuppliers.findMany({
    with: { entity: true },
    orderBy: (s, { asc }) => [asc(s.name)],
  })

  return NextResponse.json(
    suppliers.map(s => ({
      id: s.id,
      entityId: s.entityId,
      entityName: s.entity?.name ?? null,
      name: s.name,
      gmailLabel: s.gmailLabel,
      keywords: s.keywords,
      fy: s.fy,
      defaultAtoCode: s.defaultAtoCode,
      isActive: s.isActive,
      lastScannedAt: s.lastScannedAt?.toISOString() ?? null,
    }))
  )
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { name, entityId, gmailLabel, keywords, fy, defaultAtoCode } = body

  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!fy?.trim()) return NextResponse.json({ error: 'fy is required' }, { status: 400 })

  const [created] = await db
    .insert(invoiceSuppliers)
    .values({
      name: name.trim(),
      entityId: entityId || null,
      gmailLabel: gmailLabel?.trim() || null,
      keywords: Array.isArray(keywords) ? keywords : [],
      fy: fy.trim(),
      defaultAtoCode: defaultAtoCode || null,
    })
    .returning()

  return NextResponse.json(created, { status: 201 })
}
