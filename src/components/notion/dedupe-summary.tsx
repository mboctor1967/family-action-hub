'use client'
import { useMemo } from 'react'
import { type DedupeReport, type Decisions, pickKeepId } from '@/lib/notion/dedupe-schema'
import { Button } from '@/components/ui/button'

export type ReasonRow = {
  reason: string
  clusters: number
  pages: number
  pending: number
  pendingRows: { cluster: number; title: string; id: string }[]
}

export type DedupeSummaryStats = {
  totalClusters: number
  totalPages: number
  deletionCandidates: number
  archivedCount: number
  pendingCount: number
  byReason: ReasonRow[]
}

export function computeSummary(report: DedupeReport, decisions: Decisions): DedupeSummaryStats {
  let totalPages = 0
  let deletionCandidates = 0
  let archivedCount = 0
  let pendingCount = 0
  const reasonMap = new Map<string, ReasonRow>()

  for (const c of report) {
    const keepId = pickKeepId(c)
    totalPages += c.pages.length
    if (!reasonMap.has(c.reason)) {
      reasonMap.set(c.reason, { reason: c.reason, clusters: 0, pages: 0, pending: 0, pendingRows: [] })
    }
    const row = reasonMap.get(c.reason)!
    row.clusters += 1
    row.pages += c.pages.length
    for (const p of c.pages) {
      if (p.id === keepId) continue
      deletionCandidates += 1
      const isArchived = decisions[p.id]?.status === 'archived'
      if (isArchived) {
        archivedCount += 1
      } else {
        pendingCount += 1
        row.pending += 1
        row.pendingRows.push({ cluster: c.cluster, title: p.title, id: p.id })
      }
    }
  }

  return {
    totalClusters: report.length,
    totalPages,
    deletionCandidates,
    archivedCount,
    pendingCount,
    byReason: Array.from(reasonMap.values()).sort((a, b) => b.pending - a.pending),
  }
}

export function DedupeSummary({
  report,
  decisions,
  busy,
  onArchiveReason,
}: {
  report: DedupeReport
  decisions: Decisions
  busy: boolean
  onArchiveReason: (row: ReasonRow) => void
}) {
  const stats = useMemo(() => computeSummary(report, decisions), [report, decisions])

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="text-sm">
        <strong>{stats.totalClusters}</strong> clusters ·{' '}
        <strong>{stats.totalPages}</strong> pages ·{' '}
        <strong>{stats.deletionCandidates}</strong> candidates for archive ·{' '}
        <strong>{stats.archivedCount}</strong> already archived ·{' '}
        <strong>{stats.pendingCount}</strong> pending
      </div>
      {stats.byReason.length > 0 && (
        <div className="space-y-1.5">
          {stats.byReason.map((r) => (
            <div key={r.reason} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <span className="font-medium">{r.reason}</span>
                <span className="text-muted-foreground">
                  : {r.clusters} clusters · {r.pages} pages · {r.pending} pending
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || r.pending === 0}
                onClick={() => onArchiveReason(r)}
              >
                Archive all pending in this category
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
