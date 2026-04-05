import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialCategories, financialSubcategories } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const fields: Record<string, any> = {}
  if (body.name !== undefined) fields.name = body.name.trim().toUpperCase()
  if (body.sortOrder !== undefined) fields.sortOrder = body.sortOrder
  if (body.color !== undefined) fields.color = body.color

  if (Object.keys(fields).length === 0) return NextResponse.json({ error: 'No fields' }, { status: 400 })

  const [updated] = await db.update(financialCategories).set(fields).where(eq(financialCategories.id, id)).returning()
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Update subcategories if provided
  if (body.subcategories && Array.isArray(body.subcategories)) {
    // Delete existing and re-insert
    await db.delete(financialSubcategories).where(eq(financialSubcategories.categoryId, id))
    for (let i = 0; i < body.subcategories.length; i++) {
      const name = body.subcategories[i]?.trim()
      if (name) {
        await db.insert(financialSubcategories).values({ categoryId: id, name, sortOrder: i })
      }
    }
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Subcategories cascade-deleted via FK
  await db.delete(financialCategories).where(eq(financialCategories.id, id))
  return NextResponse.json({ success: true })
}
