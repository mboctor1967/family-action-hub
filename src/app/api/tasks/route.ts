import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tasks, profiles, topics, emailsScanned, comments, subtasks } from '@/lib/db/schema'
import { eq, desc, and, or, lte, isNull, sql } from 'drizzle-orm'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const assignee = searchParams.get('assignee')
  const topic = searchParams.get('topic')
  const priority = searchParams.get('priority')

  const results = await db.query.tasks.findMany({
    where: and(
      status ? eq(tasks.status, status) : undefined,
      assignee ? eq(tasks.assigneeId, assignee) : undefined,
      topic ? eq(tasks.topicId, topic) : undefined,
      priority ? eq(tasks.priority, priority) : undefined,
      !searchParams.get('include_snoozed')
        ? or(isNull(tasks.snoozedUntil), lte(tasks.snoozedUntil, new Date()))
        : undefined,
    ),
    with: {
      assignee: { columns: { id: true, name: true, avatarUrl: true } },
      topic: { columns: { id: true, name: true, color: true, icon: true } },
      sourceEmail: { columns: { id: true, subject: true, fromAddress: true, fromName: true } },
      comments: { columns: { id: true } },
      subtasks: { columns: { id: true, title: true, isComplete: true } },
    },
    orderBy: [desc(tasks.createdAt)],
  })

  return NextResponse.json(results)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const [task] = await db.insert(tasks).values({
    ...body,
    createdBy: session.user.id,
  }).returning()

  return NextResponse.json(task, { status: 201 })
}
