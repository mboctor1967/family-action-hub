'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/ui/page-header'
import { ExternalLink, Send, ThumbsUp, ThumbsDown, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-600',
}

export default function TaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const [task, setTask] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [members, setMembers] = useState<any[]>([])
  const [topics, setTopics] = useState<any[]>([])
  const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDismissDialog, setShowDismissDialog] = useState(false)
  const [dismissReason, setDismissReason] = useState('')

  useEffect(() => {
    loadTask()
    loadOptions()
  }, [params.id])

  async function loadTask() {
    const res = await fetch(`/api/tasks/${params.id}`)
    if (res.ok) {
      setTask(await res.json())
    }
    setLoading(false)
  }

  async function loadOptions() {
    try {
      const [membersRes, topicsRes] = await Promise.all([
        fetch('/api/members'),
        fetch('/api/topics'),
      ])
      if (membersRes.ok) setMembers(await membersRes.json())
      if (topicsRes.ok) setTopics(await topicsRes.json())
    } catch {
      // Options are non-critical, ignore errors
    }
  }

  async function updateTask(updates: Record<string, any>) {
    const res = await fetch(`/api/tasks/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      setTask({ ...task, ...updates })
      toast.success('Updated')
    }
  }

  async function addComment() {
    if (!comment.trim()) return
    const res = await fetch(`/api/tasks/${params.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: comment }),
    })
    if (res.ok) {
      setComment('')
      loadTask()
      toast.success('Comment added')
    }
  }

  async function toggleSubtask(subtaskId: string, isComplete: boolean) {
    try {
      await fetch(`/api/tasks/${params.id}/subtasks/${subtaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isComplete: !isComplete }),
      })
      loadTask()
    } catch {
      toast.error('Failed to update subtask')
    }
  }

  async function deleteTask() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/tasks/${params.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Task deleted')
        router.push('/tasks')
      } else {
        toast.error('Failed to delete task')
      }
    } catch {
      toast.error('Failed to delete task')
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (newStatus === 'dismissed') {
      setShowDismissDialog(true)
      return
    }
    updateTask({ status: newStatus })
  }

  async function confirmDismiss() {
    await updateTask({
      status: 'dismissed',
      dismissedReason: dismissReason.trim() || null,
    })
    setShowDismissDialog(false)
    setDismissReason('')
  }

  async function sendFeedback(vote: 'up' | 'down') {
    try {
      const res = await fetch(`/api/tasks/${params.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote }),
      })
      if (res.ok) {
        setFeedbackGiven(vote)
        toast.success(vote === 'up' ? 'Thanks! Marked as good classification' : 'Got it — will improve future scans')
      }
    } catch {
      toast.error('Failed to save feedback')
    }
  }

  if (loading) return <div className="p-4 text-center text-muted-foreground">Loading...</div>
  if (!task) return <div className="p-4 text-center text-muted-foreground">Task not found</div>

  return (
    <div className="space-y-6">
      <PageHeader
        title={task.title}
        subtitle={task.description || undefined}
        backTo="/tasks"
        action={
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        }
      />

      {/* Controls */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select value={task.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-9 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="waiting">Waiting</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Priority</label>
          <Select value={task.priority} onValueChange={(v) => updateTask({ priority: v })}>
            <SelectTrigger className="h-9 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Assignee</label>
          {members.length > 0 ? (
            <Select
              value={task.assigneeId || 'unassigned'}
              onValueChange={(v) => updateTask({ assigneeId: v === 'unassigned' ? null : v })}
            >
              <SelectTrigger className="h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm mt-1 h-9 flex items-center">{task.assignee?.name || 'Unassigned'}</p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Topic</label>
          {topics.length > 0 ? (
            <Select
              value={task.topicId || 'none'}
              onValueChange={(v) => updateTask({ topicId: v === 'none' ? null : v })}
            >
              <SelectTrigger className="h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No topic</SelectItem>
                {topics.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm mt-1 h-9 flex items-center">{task.topic?.name || 'No topic'}</p>
          )}
        </div>
      </div>

      {/* Dismissed reason */}
      {task.status === 'dismissed' && task.dismissedReason && (
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs font-medium text-muted-foreground">Dismissed reason</p>
          <p className="text-sm mt-1">{task.dismissedReason}</p>
        </div>
      )}

      {/* Due date */}
      {task.dueDate && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">Due date</label>
          <p className="text-sm">{format(new Date(task.dueDate), 'PPP')}</p>
        </div>
      )}

      {/* Gmail link */}
      {task.gmailLink && (
        <a
          href={task.gmailLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          View original email in Gmail
        </a>
      )}

      {/* Source email info */}
      {task.sourceEmail && (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">From email</p>
          <p className="text-sm font-medium">{task.sourceEmail.subject}</p>
          <p className="text-xs text-muted-foreground">
            From: {task.sourceEmail.fromName || task.sourceEmail.fromAddress}
          </p>
          {task.sourceEmail.aiSummary && (
            <p className="text-xs text-muted-foreground italic">
              AI Summary: {task.sourceEmail.aiSummary}
            </p>
          )}
        </div>
      )}

      {/* AI Classification Feedback */}
      {task.sourceEmail && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
          <span className="text-sm text-blue-800">Was this correctly flagged as actionable?</span>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm"
              variant={feedbackGiven === 'up' ? 'default' : 'outline'}
              className={cn(
                'h-8 px-3',
                feedbackGiven === 'up' && 'bg-green-600 hover:bg-green-700'
              )}
              onClick={() => sendFeedback('up')}
              disabled={feedbackGiven !== null}
            >
              <ThumbsUp className="h-4 w-4 mr-1" />
              Yes
            </Button>
            <Button
              size="sm"
              variant={feedbackGiven === 'down' ? 'default' : 'outline'}
              className={cn(
                'h-8 px-3',
                feedbackGiven === 'down' && 'bg-red-600 hover:bg-red-700'
              )}
              onClick={() => sendFeedback('down')}
              disabled={feedbackGiven !== null}
            >
              <ThumbsDown className="h-4 w-4 mr-1" />
              No
            </Button>
          </div>
        </div>
      )}

      {/* Subtasks */}
      {task.subtasks && task.subtasks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Subtasks</h3>
          <div className="space-y-2">
            {task.subtasks
              .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
              .map((st: any) => (
                <div key={st.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={st.isComplete}
                    onCheckedChange={() => toggleSubtask(st.id, st.isComplete)}
                  />
                  <span className={cn('text-sm', st.isComplete && 'line-through text-muted-foreground')}>
                    {st.title}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Comments</h3>
        <div className="space-y-3 mb-3">
          {task.comments?.map((c: any) => (
            <div key={c.id} className="flex gap-2">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarImage src={c.user?.avatarUrl} />
                <AvatarFallback className="text-[10px]">
                  {c.user?.name?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium">{c.user?.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(c.createdAt), 'MMM d, h:mm a')}
                  </span>
                </div>
                <p className="text-sm">{c.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment..."
            className="min-h-[60px] text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                addComment()
              }
            }}
          />
          <Button size="icon" onClick={addComment} disabled={!comment.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{task.title}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteTask} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dismiss reason dialog */}
      <Dialog open={showDismissDialog} onOpenChange={setShowDismissDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss task</DialogTitle>
            <DialogDescription>
              Why are you dismissing this task? (optional)
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
            placeholder="e.g. Not relevant, duplicate, resolved itself..."
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDismissDialog(false)
              setDismissReason('')
            }}>
              Cancel
            </Button>
            <Button onClick={confirmDismiss}>
              Dismiss Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
