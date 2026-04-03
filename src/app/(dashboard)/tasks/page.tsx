import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tasks, profiles, topics } from '@/lib/db/schema'
import { eq, desc, and, isNull } from 'drizzle-orm'
import { TaskCard } from '@/components/tasks/task-card'
import { TaskFilters } from '@/components/tasks/task-filters'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | undefined }>
}

export default async function TasksPage({ searchParams }: PageProps) {
  const params = await searchParams
  const session = await auth()
  if (!session?.user) return null

  const conditions = []
  if (params.status) conditions.push(eq(tasks.status, params.status))
  if (params.priority) conditions.push(eq(tasks.priority, params.priority))
  if (params.assignee) conditions.push(eq(tasks.assigneeId, params.assignee))
  if (params.topic) conditions.push(eq(tasks.topicId, params.topic))

  const allTasks = await db.query.tasks.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      assignee: { columns: { id: true, name: true, avatarUrl: true } },
      topic: { columns: { id: true, name: true, color: true, icon: true } },
      comments: { columns: { id: true } },
      subtasks: { columns: { id: true, title: true, isComplete: true } },
    },
    orderBy: [desc(tasks.createdAt)],
  })

  const topLevelTopics = await db.select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(isNull(topics.parentId))
    .orderBy(topics.sortOrder)

  const members = await db.select({ id: profiles.id, name: profiles.name })
    .from(profiles)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">All Tasks</h2>
        <Link href="/tasks/new">
          <Button size="sm" variant="outline">
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
        </Link>
      </div>

      <TaskFilters
        topics={topLevelTopics}
        members={members as any}
      />

      <div className="space-y-2">
        {allTasks.map((task) => (
          <TaskCard key={task.id} task={task as any} />
        ))}
      </div>

      {allTasks.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No tasks found
        </div>
      )}
    </div>
  )
}
