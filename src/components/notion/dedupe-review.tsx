'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { type DedupeReport, type DedupePage, type Decisions, pickKeepId, hasMedia } from '@/lib/notion/dedupe-schema'
import { useCallback } from 'react'
import { DedupeClusterCard } from './dedupe-cluster-card'
import { DedupePreviewDialog } from './dedupe-preview-dialog'
import { DedupeSummary, type ReasonRow } from './dedupe-summary'
import { DedupeLegend } from './dedupe-legend'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

export type DedupeReviewProps = {
  reportId: string
  report: DedupeReport
  initialDecisions: Decisions
}

const CHUNK_SIZE = 100

export function DedupeReview({ reportId, report, initialDecisions }: DedupeReviewProps) {
  const router = useRouter()
  const [decisions, setDecisions] = useState<Decisions>(initialDecisions)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewRows, setPreviewRows] = useState<{ cluster: number; title: string; id: string }[] | null>(null)
  const [previewTitle, setPreviewTitle] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [minChars, setMinChars] = useState(25)
  const [hideIneligible, setHideIneligible] = useState(false)

  const isEligible = useCallback(
    (p: DedupePage) => p.bodyLen >= minChars || hasMedia(p),
    [minChars],
  )

  const keepIds = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of report) m.set(c.cluster, pickKeepId(c))
    return m
  }, [report])

  // Initialize collapsed set on mount: clusters where all non-KEEP pages are already archived.
  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    const s = new Set<number>()
    for (const c of report) {
      const keepId = pickKeepId(c)
      const allArchived = c.pages.every(
        (p) => p.id === keepId || initialDecisions[p.id]?.status === 'archived',
      )
      if (allArchived) s.add(c.cluster)
    }
    return s
  })

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleCollapse = (clusterNum: number) => {
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(clusterNum)) next.delete(clusterNum); else next.add(clusterNum)
      return next
    })
  }

  const collapseAll = () => setCollapsed(new Set(report.map((c) => c.cluster)))
  const expandAll = () => setCollapsed(new Set())

  const eligibleStats = useMemo(() => {
    let eligible = 0
    let excluded = 0
    for (const c of report) {
      const keepId = keepIds.get(c.cluster)
      for (const p of c.pages) {
        if (p.id === keepId) continue
        if (decisions[p.id]?.status === 'archived') continue
        if (isEligible(p)) eligible++
        else excluded++
      }
    }
    return { eligible, excluded }
  }, [report, keepIds, decisions, isEligible])

  const selectAllEligible = () => {
    const next = new Set<string>()
    for (const c of report) {
      const keepId = keepIds.get(c.cluster)
      for (const p of c.pages) {
        if (p.id === keepId) continue
        if (decisions[p.id]?.status === 'archived') continue
        if (isEligible(p)) next.add(p.id)
      }
    }
    setSelected(next)
  }

  const clearSelection = () => setSelected(new Set())

  async function archiveChunk(pageIds: string[]): Promise<{
    ok: boolean
    archived: number
    failed: { pageId: string; error: string }[]
    status?: number
    error?: string
  }> {
    const res = await fetch(`/api/notion/dedupe/${reportId}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageIds }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, archived: 0, failed: [], status: res.status, error: data?.error }
    }
    return { ok: true, archived: data.archived ?? 0, failed: data.failed ?? [] }
  }

  async function runArchive(pageIds: string[]) {
    if (pageIds.length === 0) return
    setBusy(true)
    const total = pageIds.length
    const toastId = toast.loading(total > CHUNK_SIZE ? `Archiving 0/${total}…` : `Archiving ${total}…`)
    let archivedTotal = 0
    let failedTotal: { pageId: string; error: string }[] = []
    let aborted = false
    let abortMsg = ''

    try {
      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = pageIds.slice(i, i + CHUNK_SIZE)
        const result = await archiveChunk(chunk)
        if (!result.ok) {
          aborted = true
          abortMsg = result.error || `Archive failed (${result.status})`
          break
        }
        archivedTotal += result.archived
        failedTotal = failedTotal.concat(result.failed)

        // Optimistic decisions update for this chunk
        const now = new Date().toISOString()
        const failedSet = new Set(result.failed.map((f) => f.pageId))
        setDecisions((prev) => {
          const next = { ...prev }
          for (const id of chunk) {
            if (!failedSet.has(id)) next[id] = { status: 'archived', at: now }
          }
          for (const f of result.failed) next[f.pageId] = { status: 'failed', at: now, error: f.error }
          return next
        })

        if (total > CHUNK_SIZE) {
          const done = Math.min(i + CHUNK_SIZE, total)
          toast.loading(`Archiving ${done}/${total}…`, { id: toastId })
        }
      }

      if (aborted) {
        toast.error(
          `${abortMsg}. Completed ${archivedTotal}/${total} before stopping${
            failedTotal.length ? `, ${failedTotal.length} failed` : ''
          }.`,
          { id: toastId },
        )
      } else {
        toast.success(
          `Archived ${archivedTotal}${failedTotal.length ? `, ${failedTotal.length} failed` : ''}`,
          { id: toastId },
        )
      }

      setSelected(new Set())
      router.refresh()
    } finally {
      setBusy(false)
      setPreviewOpen(false)
      setPreviewRows(null)
      setPreviewTitle(undefined)
    }
  }

  const selectedClusters = useMemo(() => {
    const ids = new Set<number>()
    for (const c of report) if (c.pages.some((p) => selected.has(p.id))) ids.add(c.cluster)
    return ids.size
  }, [report, selected])

  const archiveCluster = (clusterNum: number) => {
    const c = report.find((x) => x.cluster === clusterNum)
    if (!c) return
    const keepId = keepIds.get(clusterNum)!
    const ids = c.pages
      .filter((p) => p.id !== keepId && decisions[p.id]?.status !== 'archived' && isEligible(p))
      .map((p) => p.id)
    if (ids.length === 0) return
    runArchive(ids)
  }

  const archiveReason = (row: ReasonRow) => {
    if (row.pendingRows.length === 0) return
    setPreviewRows(row.pendingRows)
    setPreviewTitle(`Archive all pending — ${row.reason}`)
    setPreviewOpen(true)
  }

  const openSelectedPreview = () => {
    setPreviewRows(null)
    setPreviewTitle(undefined)
    setPreviewOpen(true)
  }

  const confirmPreview = () => {
    if (previewRows) {
      runArchive(previewRows.map((r) => r.id))
    } else {
      runArchive(Array.from(selected))
    }
  }

  return (
    <div className="space-y-4">
      <DedupeSummary report={report} decisions={decisions} busy={busy} isEligible={isEligible} onArchiveReason={archiveReason} />
      <DedupeLegend />
      <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
        <div>
          Tick DELETE rows to archive. KEEP rows are auto-picked (largest effective size = text + media, most recent edit) and locked.
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Min chars to auto-select:</span>
            <input
              type="number"
              min={0}
              value={minChars}
              onChange={(e) => setMinChars(Math.max(0, Number(e.target.value) || 0))}
              className="w-20 rounded border px-2 py-1 text-sm"
            />
          </label>
          <span className="text-xs text-muted-foreground">
            DELETEs ≥ {minChars} chars or with any image/file/embed → eligible.
            <strong className="text-foreground"> {eligibleStats.eligible}</strong> eligible,{' '}
            <strong className="text-foreground">{eligibleStats.excluded}</strong> excluded.
          </span>
          <Button size="sm" variant="outline" disabled={busy || eligibleStats.eligible === 0} onClick={selectAllEligible}>
            Select all eligible ({eligibleStats.eligible})
          </Button>
          <Button size="sm" variant="outline" disabled={busy || selected.size === 0} onClick={clearSelection}>
            Clear selection
          </Button>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
            <input
              type="checkbox"
              checked={hideIneligible}
              onChange={(e) => setHideIneligible(e.target.checked)}
              className="rounded"
            />
            Hide ineligible DELETE rows
          </label>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={collapseAll}>Collapse all</Button>
          <Button size="sm" variant="outline" onClick={expandAll}>Expand all</Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm">
            Selected: <strong>{selected.size}</strong> pages across <strong>{selectedClusters}</strong> clusters
          </div>
          <Button disabled={selected.size === 0 || busy} onClick={openSelectedPreview}>
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
            collapsed={collapsed.has(c.cluster)}
            busy={busy}
            isEligible={isEligible}
            hideIneligible={hideIneligible}
            onToggle={toggle}
            onRetry={(id) => runArchive([id])}
            onToggleCollapse={toggleCollapse}
            onArchiveCluster={archiveCluster}
          />
        ))}
      </div>
      <DedupePreviewDialog
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false)
          setPreviewRows(null)
          setPreviewTitle(undefined)
        }}
        onConfirm={confirmPreview}
        selected={selected}
        report={report}
        busy={busy}
        explicitRows={previewRows ?? undefined}
        title={previewTitle}
      />
    </div>
  )
}
