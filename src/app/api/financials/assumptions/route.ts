import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialAssumptions } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getAssumptionType, ASSUMPTION_TYPES } from '@/lib/assumptions'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const fy = searchParams.get('fy')

  const assumptions = await db.query.financialAssumptions.findMany({
    where: fy ? eq(financialAssumptions.fy, fy) : undefined,
    with: { entity: true },
    orderBy: (a, { asc }) => [asc(a.fy), asc(a.entityId), asc(a.assumptionType)],
  })

  return NextResponse.json(assumptions)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { fy, entityId, assumptionType, valueNumeric, valueText, rationale, approvedBy } = await request.json()

  if (!fy || !entityId || !assumptionType) {
    return NextResponse.json({ error: 'FY, entity, and type are required' }, { status: 400 })
  }

  if (!ASSUMPTION_TYPES.some((t) => t.key === assumptionType)) {
    return NextResponse.json({ error: 'Invalid assumption type' }, { status: 400 })
  }

  // Check for duplicate
  const existing = await db.query.financialAssumptions.findFirst({
    where: and(
      eq(financialAssumptions.fy, fy),
      eq(financialAssumptions.entityId, entityId),
      eq(financialAssumptions.assumptionType, assumptionType),
    ),
  })
  if (existing) {
    return NextResponse.json({ error: 'An assumption with this FY, entity, and type already exists' }, { status: 409 })
  }

  const [created] = await db.insert(financialAssumptions).values({
    fy,
    entityId,
    assumptionType,
    valueNumeric: valueNumeric ?? null,
    valueText: valueText ?? null,
    rationale: rationale ?? null,
    approvedBy: approvedBy ?? null,
    approvedDate: approvedBy ? new Date() : null,
  }).returning()

  return NextResponse.json(created, { status: 201 })
}
