import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { subtasks } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title } = await request.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  // Get the next sort order
  const maxOrder = await db.select({ max: sql<number>`coalesce(max(${subtasks.sortOrder}), -1)` })
    .from(subtasks)
    .where(eq(subtasks.taskId, id))

  const [subtask] = await db.insert(subtasks).values({
    taskId: id,
    title: title.trim(),
    sortOrder: (maxOrder[0]?.max ?? -1) + 1,
  }).returning()

  return NextResponse.json(subtask, { status: 201 })
}
