'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/ui/page-header'
import toast from 'react-hot-toast'

export default function NewTaskPage() {
  const router = useRouter()
  const [members, setMembers] = useState<any[]>([])
  const [topics, setTopics] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    assigneeId: '',
    topicId: '',
    dueDate: '',
  })

  useEffect(() => {
    Promise.all([fetch('/api/members'), fetch('/api/topics')])
      .then(async ([mRes, tRes]) => {
        if (mRes.ok) setMembers(await mRes.json())
        if (tRes.ok) setTopics(await tRes.json())
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.error('Title is required')
      return
    }

    setSaving(true)
    try {
      const body: Record<string, any> = {
        title: form.title.trim(),
        priority: form.priority,
      }
      if (form.description.trim()) body.description = form.description.trim()
      if (form.assigneeId) body.assigneeId = form.assigneeId
      if (form.topicId) body.topicId = form.topicId
      if (form.dueDate) body.dueDate = new Date(form.dueDate).toISOString()

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const task = await res.json()
        toast.success('Task created')
        router.push(`/tasks/${task.id}`)
      } else {
        toast.error('Failed to create task')
      }
    } catch {
      toast.error('Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <PageHeader title="New Task" backTo="/tasks" />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Title *</label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="What needs to be done?"
            className="mt-1"
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Add more details..."
            className="mt-1 min-h-[80px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Priority</label>
            <Select value={form.priority} onValueChange={(v) => v && setForm({ ...form, priority: v })}>
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
            <Select
              value={form.assigneeId || 'unassigned'}
              onValueChange={(v) => v && setForm({ ...form, assigneeId: v === 'unassigned' ? '' : v })}
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
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Topic</label>
            <Select
              value={form.topicId || 'none'}
              onValueChange={(v) => v && setForm({ ...form, topicId: v === 'none' ? '' : v })}
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
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Due date</label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="h-9 mt-1"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? 'Creating...' : 'Create Task'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
