'use client'
import { useMemo, useState } from 'react'
import { type DedupeReport, type Decisions, pickKeepId } from '@/lib/notion/dedupe-schema'
import { DedupeClusterCard } from './dedupe-cluster-card'
import { Button } from '@/components/ui/button'

export type DedupeReviewProps = {
  reportId: string
  report: DedupeReport
  initialDecisions: Decisions
}

export function DedupeReview({ report, initialDecisions }: DedupeReviewProps) {
  const [decisions] = useState<Decisions>(initialDecisions)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const keepIds = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of report) m.set(c.cluster, pickKeepId(c))
    return m
  }, [report])

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectedClusters = useMemo(() => {
    const ids = new Set<number>()
    for (const c of report) if (c.pages.some((p) => selected.has(p.id))) ids.add(c.cluster)
    return ids.size
  }, [report, selected])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        Tick DELETE rows to archive. KEEP rows are auto-picked (longest body, most recent edit) and locked.
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm">
          Selected: <strong>{selected.size}</strong> pages across <strong>{selectedClusters}</strong> clusters
        </div>
        <div className="flex gap-2">
          <Button disabled={selected.size === 0} variant="default">Preview archive</Button>
        </div>
      </div>
      <div className="space-y-3">
        {report.map((c) => (
          <DedupeClusterCard
            key={c.cluster}
            cluster={c}
            keepId={keepIds.get(c.cluster)!}
            decisions={decisions}
            selected={selected}
            onToggle={toggle}
            onRetry={() => { /* wired in Task 11 */ }}
          />
        ))}
      </div>
    </div>
  )
}
