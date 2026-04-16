'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Calendar, MessageSquare, CheckCircle2, ExternalLink, ThumbsUp, ThumbsDown, Clock, Mail, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow, format } from 'date-fns'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

const priorityColors = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
}

const statusColors = {
  new: 'bg-blue-500',
  in_progress: 'bg-yellow-500',
  waiting: 'bg-purple-500',
  done: 'bg-green-500',
  dismissed: 'bg-gray-400',
}

interface TaskCardProps {
  task: {
    id: string
    title: string
    description?: string | null
    status: string
    priority: string
    dueDate?: string | null
    gmailLink?: string | null
    createdAt: string
    assignee?: { id: string; name: string; avatarUrl?: string | null } | null
    topic?: { id: string; name: string; color: string } | null
    comments?: { id: string }[] | number
    subtasks?: { id: string; title: string; isComplete: boolean }[]
    sourceEmail?: { id: string; subject: string; fromName?: string | null; date?: string | null } | null
  }
}

export function TaskCard({ task }: TaskCardProps) {
  const router = useRouter()
  const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null)
  const [triageLoading, setTriageLoading] = useState(false)

  const isTriageable = task.status === 'new' && task.sourceEmail

  async function triageTask(action: 'confirm' | 'dismiss', e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setTriageLoading(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action === 'confirm' ? 'in_progress' : 'dismissed' }),
      })
      if (res.ok) {
        toast.success(action === 'confirm' ? 'Task confirmed' : 'Task dismissed')
        router.refresh()
      }
    } catch {
      toast.error('Failed to update task')
    } finally {
      setTriageLoading(false)
    }
  }

  async function sendFeedback(vote: 'up' | 'down', e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      const res = await fetch(`/api/tasks/${task.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote }),
      })
      if (res.ok) {
        setFeedbackGiven(vote)
        toast.success(vote === 'up' ? 'Marked as good classification' : 'Marked as wrong — will improve')
      }
    } catch {
      toast.error('Failed to save feedback')
    }
  }

  const commentCount = typeof task.comments === 'number'
    ? task.comments
    : Array.isArray(task.comments) ? task.comments.length : 0
  const completedSubtasks = task.subtasks?.filter((s) => s.isComplete).length || 0
  const totalSubtasks = task.subtasks?.length || 0
  const isDone = task.status === 'done' || task.status === 'dismissed'

  return (
    <Link href={`/tasks/${task.id}`}>
      <Card className={cn(
        'p-4 hover:shadow-md transition-shadow cursor-pointer',
        isDone && 'opacity-60'
      )}>
        <div className="flex items-start gap-3">
          {/* Status dot */}
          <div
            className={cn(
              'w-2.5 h-2.5 rounded-full mt-1.5 shrink-0',
              statusColors[task.status as keyof typeof statusColors]
            )}
          />

          <div className="flex-1 min-w-0">
            {/* Title */}
            <h3 className={cn(
              'font-medium text-sm leading-tight',
              isDone && 'line-through text-muted-foreground'
            )}>
              {task.title}
            </h3>

            {/* Description preview */}
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge
                variant="outline"
                className={cn('text-[10px] px-1.5 py-0', priorityColors[task.priority as keyof typeof priorityColors])}
              >
                {task.priority}
              </Badge>

              {task.topic && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0"
                  style={{ borderColor: task.topic.color, color: task.topic.color }}
                >
                  {task.topic.name}
                </Badge>
              )}

              {task.dueDate && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatDistanceToNow(new Date(task.dueDate), { addSuffix: true })}
                </span>
              )}

              {commentCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  {commentCount}
                </span>
              )}

              {totalSubtasks > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" />
                  {completedSubtasks}/{totalSubtasks}
                </span>
              )}

              {task.createdAt && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground" title={`Created: ${format(new Date(task.createdAt), 'd MMM yyyy, h:mm a')}`}>
                  <Clock className="h-3 w-3" />
                  {task.sourceEmail ? 'Scanned ' : ''}{formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                </span>
              )}

              {task.sourceEmail && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground truncate max-w-[300px]" title={`From: ${task.sourceEmail.fromName || 'Unknown'}\nSubject: ${task.sourceEmail.subject}\nEmail date: ${task.sourceEmail.date ? format(new Date(task.sourceEmail.date), 'd MMM yyyy') : 'N/A'}`}>
                  <Mail className="h-3 w-3 shrink-0" />
                  {task.sourceEmail.fromName || 'Scan'}
                  {task.sourceEmail.date && (
                    <span className="text-muted-foreground/70">
                      · {format(new Date(task.sourceEmail.date), 'd MMM')}
                    </span>
                  )}
                </span>
              )}

              {task.gmailLink && (() => {
                const gmailLink = task.gmailLink
                return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    window.open(gmailLink, '_blank', 'noopener,noreferrer')
                  }}
                  className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Email
                </button>
                )
              })()}
            </div>
          </div>

          {/* Right side: assignee + triage/feedback */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            {task.assignee && (
              <Avatar className="h-7 w-7">
                <AvatarImage src={task.assignee.avatarUrl || undefined} />
                <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700">
                  {task.assignee.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}
            {isTriageable ? (
              <div className="flex gap-1">
                <button
                  onClick={(e) => triageTask('confirm', e)}
                  disabled={triageLoading}
                  className="p-1 rounded-md bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
                  title="Confirm task"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => triageTask('dismiss', e)}
                  disabled={triageLoading}
                  className="p-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                  title="Dismiss task"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-1">
                <button
                  onClick={(e) => sendFeedback('up', e)}
                  className={cn(
                    'p-0.5 rounded hover:bg-green-50 transition-colors',
                    feedbackGiven === 'up' ? 'text-green-600' : 'text-gray-300 hover:text-green-500'
                  )}
                  title="Good classification"
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => sendFeedback('down', e)}
                  className={cn(
                    'p-0.5 rounded hover:bg-red-50 transition-colors',
                    feedbackGiven === 'down' ? 'text-red-600' : 'text-gray-300 hover:text-red-500'
                  )}
                  title="Wrong classification"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  )
}
