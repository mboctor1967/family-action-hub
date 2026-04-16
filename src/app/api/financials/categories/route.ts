import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialCategories, financialSubcategories } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const categories = await db.query.financialCategories.findMany({
    with: { subcategories: { orderBy: (s, { asc }) => [asc(s.sortOrder)] } },
    orderBy: (c, { asc }) => [asc(c.sortOrder)],
  })

  return NextResponse.json(categories)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { name, subcategories } = body
  if (!name?.trim()) return NextResponse.json({ error: 'Category name is required' }, { status: 400 })

  const normalized = name.trim().toUpperCase()

  try {
    const [cat] = await db.insert(financialCategories).values({ name: normalized }).returning()

    if (subcategories?.length) {
      for (let i = 0; i < subcategories.length; i++) {
        if (subcategories[i]?.trim()) {
          await db.insert(financialSubcategories).values({
            categoryId: cat.id,
            name: subcategories[i].trim(),
            sortOrder: i,
          })
        }
      }
    }

    return NextResponse.json(cat, { status: 201 })
  } catch (e: any) {
    const msg = String(e?.message || e)
    // Unique-violation (Postgres 23505) or generic duplicate
    if (/duplicate key|23505|unique/i.test(msg)) {
      return NextResponse.json(
        { error: `A category called "${normalized}" already exists.` },
        { status: 409 },
      )
    }
    console.error('categories POST failed:', msg)
    return NextResponse.json({ error: `Could not create category: ${msg.slice(0, 200)}` }, { status: 500 })
  }
}
