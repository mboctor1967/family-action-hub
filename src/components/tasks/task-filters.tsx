'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface TaskFiltersProps {
  topics: { id: string; name: string }[]
  members: { id: string; name: string }[]
}

const STATUS_OPTIONS: Record<string, string> = {
  active: 'Active',
  all: 'All Status',
  new: 'New',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  done: 'Done',
  dismissed: 'Dismissed',
}

const PRIORITY_OPTIONS: Record<string, string> = {
  all: 'All Priority',
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export function TaskFilters({ topics, members }: TaskFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all' || (key === 'status' && value === 'active')) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.push(`?${params.toString()}`)
  }

  const statusValue = searchParams.get('status') || 'active'
  const priorityValue = searchParams.get('priority') || 'all'
  const assigneeValue = searchParams.get('assignee') || 'all'
  const topicValue = searchParams.get('topic') || 'all'

  const assigneeLabel = assigneeValue === 'all'
    ? 'All Members'
    : members.find((m) => m.id === assigneeValue)?.name || 'All Members'

  const topicLabel = topicValue === 'all'
    ? 'All Topics'
    : topics.find((t) => t.id === topicValue)?.name || 'All Topics'

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">Status</label>
        <Select
          value={statusValue}
          onValueChange={(v) => v && updateFilter('status', v)}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <span className="truncate">{STATUS_OPTIONS[statusValue] || 'Active'}</span>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_OPTIONS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">Priority</label>
        <Select
          value={priorityValue}
          onValueChange={(v) => v && updateFilter('priority', v)}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <span className="truncate">{PRIORITY_OPTIONS[priorityValue] || 'All Priority'}</span>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PRIORITY_OPTIONS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">Assignee</label>
        <Select
          value={assigneeValue}
          onValueChange={(v) => v && updateFilter('assignee', v)}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <span className="truncate">{assigneeLabel}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Members</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">Topic</label>
        <Select
          value={topicValue}
          onValueChange={(v) => v && updateFilter('topic', v)}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <span className="truncate">{topicLabel}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Topics</SelectItem>
            {topics.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
