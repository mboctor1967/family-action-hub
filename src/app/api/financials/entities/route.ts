import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialEntities } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const entities = await db.query.financialEntities.findMany({
    with: { accounts: true },
    orderBy: (e, { asc }) => [asc(e.sortOrder), asc(e.name)],
  })

  return NextResponse.json(entities)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, type, color } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const [entity] = await db.insert(financialEntities).values({
    name: name.trim(),
    type: type || 'personal',
    color: color || '#2B579A',
  }).returning()

  return NextResponse.json(entity, { status: 201 })
}
