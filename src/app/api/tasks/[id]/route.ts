import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tasks, profiles, topics, emailsScanned, comments, subtasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    with: {
      assignee: { columns: { id: true, name: true, avatarUrl: true, email: true } },
      creator: { columns: { id: true, name: true, avatarUrl: true } },
      topic: { columns: { id: true, name: true, color: true, icon: true } },
      sourceEmail: { columns: { id: true, subject: true, fromAddress: true, fromName: true, date: true, aiSummary: true, rawSnippet: true } },
      comments: {
        with: { user: { columns: { id: true, name: true, avatarUrl: true } } },
        orderBy: (comments, { asc }) => [asc(comments.createdAt)],
      },
      subtasks: {
        orderBy: (subtasks, { asc }) => [asc(subtasks.sortOrder)],
      },
    },
  })

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(task)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const [task] = await db.update(tasks)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(task)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await db.delete(tasks).where(eq(tasks.id, id))
  return NextResponse.json({ success: true })
}
