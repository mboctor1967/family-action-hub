import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { topics } from '@/lib/db/schema'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allTopics = await db.select({
    id: topics.id,
    name: topics.name,
    color: topics.color,
    icon: topics.icon,
    parentId: topics.parentId,
  }).from(topics).orderBy(topics.sortOrder)

  return NextResponse.json(allTopics)
}
