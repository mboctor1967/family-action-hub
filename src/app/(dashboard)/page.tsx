import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tasks, scanRuns } from '@/lib/db/schema'
import { eq, desc, inArray } from 'drizzle-orm'
import { TaskCard } from '@/components/tasks/task-card'
import { Button } from '@/components/ui/button'
import { Scan } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) return null

  const activeTasks = await db.query.tasks.findMany({
    where: inArray(tasks.status, ['new', 'in_progress', 'waiting']),
    with: {
      assignee: { columns: { id: true, name: true, avatarUrl: true } },
      topic: { columns: { id: true, name: true, color: true, icon: true } },
      comments: { columns: { id: true } },
      subtasks: { columns: { id: true, title: true, isComplete: true } },
    },
    orderBy: [desc(tasks.createdAt)],
    limit: 50,
  })

  const lastScanResults = await db.select()
    .from(scanRuns)
    .where(eq(scanRuns.status, 'completed'))
    .orderBy(desc(scanRuns.completedAt))
    .limit(1)
  const lastScan = lastScanResults[0]

  const urgentTasks = activeTasks.filter(t => t.priority === 'urgent')
  const otherTasks = activeTasks.filter(t => t.priority !== 'urgent')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Inbox</h2>
          <p className="text-sm text-muted-foreground">
            {activeTasks.length} active tasks
            {lastScan?.completedAt && (
              <> &middot; Last scan: {new Date(lastScan.completedAt).toLocaleDateString()}</>
            )}
          </p>
        </div>
        <Link href="/scan">
          <Button size="sm">
            <Scan className="mr-2 h-4 w-4" />
            Scan
          </Button>
        </Link>
      </div>

      {urgentTasks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-600 mb-2">
            Urgent ({urgentTasks.length})
          </h3>
          <div className="space-y-2">
            {urgentTasks.map((task) => (
              <TaskCard key={task.id} task={task as any} />
            ))}
          </div>
        </div>
      )}

      {otherTasks.length > 0 && (
        <div>
          {urgentTasks.length > 0 && (
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">
              Other Tasks ({otherTasks.length})
            </h3>
          )}
          <div className="space-y-2">
            {otherTasks.map((task) => (
              <TaskCard key={task.id} task={task as any} />
            ))}
          </div>
        </div>
      )}

      {activeTasks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No tasks yet</p>
          <Link href="/scan">
            <Button>
              <Scan className="mr-2 h-4 w-4" />
              Run your first scan
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
