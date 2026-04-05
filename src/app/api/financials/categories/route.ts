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

  const { name, subcategories } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const [cat] = await db.insert(financialCategories).values({
    name: name.trim().toUpperCase(),
  }).returning()

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
}
