import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tasks, profiles, topics } from '@/lib/db/schema'
import { eq, desc, and, isNull } from 'drizzle-orm'
import { TaskCard } from '@/components/tasks/task-card'
import { TaskFilters } from '@/components/tasks/task-filters'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Plus, CheckSquare } from 'lucide-react'
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
    <div className="space-y-6">
      <PageHeader
        title="All Tasks"
        subtitle={`${allTasks.length} task${allTasks.length !== 1 ? 's' : ''}`}
        action={
          <Link href="/tasks/new">
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              New
            </Button>
          </Link>
        }
      />

      <TaskFilters topics={topLevelTopics} members={members as any} />

      {allTasks.length > 0 ? (
        <div className="space-y-2">
          {allTasks.map((task) => (
            <TaskCard key={task.id} task={task as any} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CheckSquare}
          title="No tasks yet"
          description="Tasks created from Gmail scanning will appear here, or create one manually."
          action={
            <Link href="/tasks/new">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Create Task
              </Button>
            </Link>
          }
        />
      )}
    </div>
  )
}
