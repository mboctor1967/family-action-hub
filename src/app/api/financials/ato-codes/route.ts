/**
 * GET /api/financials/ato-codes
 *
 * Returns the list of ATO codes from the seeded reference table.
 * Used to populate dropdowns in the Category Manager page.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { atoCodes } from '@/lib/db/schema'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const codes = await db
    .select()
    .from(atoCodes)
    .orderBy(atoCodes.scope, atoCodes.sortOrder)

  const personal = codes.filter(c => c.scope === 'personal')
  const company = codes.filter(c => c.scope === 'company')

  return NextResponse.json({ personal, company })
}
