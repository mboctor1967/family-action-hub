'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { type DedupeReport, type Decisions, pickKeepId } from '@/lib/notion/dedupe-schema'
import { DedupeClusterCard } from './dedupe-cluster-card'
import { DedupePreviewDialog } from './dedupe-preview-dialog'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

export type DedupeReviewProps = {
  reportId: string
  report: DedupeReport
  initialDecisions: Decisions
}

export function DedupeReview({ reportId, report, initialDecisions }: DedupeReviewProps) {
  const router = useRouter()
  const [decisions, setDecisions] = useState<Decisions>(initialDecisions)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busy, setBusy] = useState(false)

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

  async function runArchive(pageIds: string[]) {
    if (pageIds.length === 0) return
    if (pageIds.length > 100) {
      toast.error('Select at most 100 pages per archive')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/notion/dedupe/${reportId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageIds }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || `Archive failed (${res.status})`)
        return
      }
      toast.success(`Archived ${data.archived}${data.failed?.length ? `, ${data.failed.length} failed` : ''}`)
      const now = new Date().toISOString()
      setDecisions((prev) => {
        const next = { ...prev }
        const failedList: { pageId: string; error: string }[] = data.failed || []
        const failedSet = new Set(failedList.map((f) => f.pageId))
        for (const id of pageIds) {
          if (!failedSet.has(id)) next[id] = { status: 'archived', at: now }
        }
        for (const f of failedList) next[f.pageId] = { status: 'failed', at: now, error: f.error }
        return next
      })
      setSelected(new Set())
      router.refresh()
    } finally {
      setBusy(false)
      setPreviewOpen(false)
    }
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
          <Button disabled={selected.size === 0 || busy} onClick={() => setPreviewOpen(true)}>
            Preview archive
          </Button>
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
            onRetry={(id) => runArchive([id])}
          />
        ))}
      </div>
      <DedupePreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onConfirm={() => runArchive(Array.from(selected))}
        selected={selected}
        report={report}
        busy={busy}
      />
    </div>
  )
}
