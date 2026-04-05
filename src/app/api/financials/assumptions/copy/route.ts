import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialAssumptions } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { fromFy, toFy } = await request.json()
  if (!fromFy || !toFy) {
    return NextResponse.json({ error: 'fromFy and toFy are required' }, { status: 400 })
  }

  // Get all assumptions from source FY
  const sourceAssumptions = await db.query.financialAssumptions.findMany({
    where: eq(financialAssumptions.fy, fromFy),
  })

  if (sourceAssumptions.length === 0) {
    return NextResponse.json({ copied: 0, skipped: 0 })
  }

  // Get existing assumptions in target FY to check for duplicates
  const targetAssumptions = await db.query.financialAssumptions.findMany({
    where: eq(financialAssumptions.fy, toFy),
  })

  const existingKeys = new Set(
    targetAssumptions.map((a) => `${a.entityId}:${a.assumptionType}`)
  )

  const toCopy = sourceAssumptions.filter(
    (a) => !existingKeys.has(`${a.entityId}:${a.assumptionType}`)
  )

  if (toCopy.length > 0) {
    await db.insert(financialAssumptions).values(
      toCopy.map((a) => ({
        fy: toFy,
        entityId: a.entityId,
        assumptionType: a.assumptionType,
        valueNumeric: a.valueNumeric,
        valueText: a.valueText,
        rationale: a.rationale,
        approvedBy: null,
        approvedDate: null,
      }))
    )
  }

  return NextResponse.json({
    copied: toCopy.length,
    skipped: sourceAssumptions.length - toCopy.length,
  })
}
