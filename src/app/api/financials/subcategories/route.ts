/**
 * POST /api/financials/subcategories
 *
 * Create a new subcategory under an existing category.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialSubcategories } from '@/lib/db/schema'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { categoryId, name, atoCodePersonal, atoCodeCompany, sortOrder } = body

  if (!categoryId || !name?.trim()) {
    return NextResponse.json({ error: 'categoryId and name are required' }, { status: 400 })
  }

  const [created] = await db
    .insert(financialSubcategories)
    .values({
      categoryId,
      name: name.trim(),
      atoCodePersonal: atoCodePersonal || null,
      atoCodeCompany: atoCodeCompany || null,
      sortOrder: sortOrder ?? 0,
    })
    .returning()

  return NextResponse.json(created, { status: 201 })
}
