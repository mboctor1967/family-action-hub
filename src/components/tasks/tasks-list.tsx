'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TaskCard } from './task-card'

interface TasksListProps {
  tasks: any[]
}

const RING_DURATION_MS = 2000

export function TasksList({ tasks }: TasksListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const newParam = searchParams.get('new')

  const newIds = useMemo(() => {
    if (!newParam) return new Set<string>()
    return new Set(newParam.split(',').filter(Boolean))
  }, [newParam])

  const [activeHighlights, setActiveHighlights] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (newIds.size === 0) return
    setActiveHighlights(newIds)

    // Scroll to the first new task that's in the current list
    const firstId = Array.from(newIds).find(id => tasks.some(t => t.id === id))
    if (firstId) {
      // Wait a tick so DOM is rendered
      requestAnimationFrame(() => {
        document.getElementById(`task-${firstId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    }

    const t = setTimeout(() => {
      setActiveHighlights(new Set())
      // Clean URL so refresh doesn't re-highlight
      router.replace('/tasks', { scroll: false })
    }, RING_DURATION_MS)
    return () => clearTimeout(t)
  }, [newIds, tasks, router])

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div key={task.id} id={`task-${task.id}`}>
          <TaskCard task={task} highlight={activeHighlights.has(task.id)} />
        </div>
      ))}
    </div>
  )
}
