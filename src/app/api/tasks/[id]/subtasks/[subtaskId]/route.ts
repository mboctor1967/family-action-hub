import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { subtasks } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; subtaskId: string }> }
) {
  const { id, subtaskId } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const [updated] = await db.update(subtasks)
    .set(body)
    .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, id)))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; subtaskId: string }> }
) {
  const { id, subtaskId } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await db.delete(subtasks).where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, id)))
  return NextResponse.json({ success: true })
}
