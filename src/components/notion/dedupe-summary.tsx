'use client'
import { useMemo } from 'react'
import { type DedupeReport, type DedupePage, type Decisions, pickKeepId } from '@/lib/notion/dedupe-schema'
import { Button } from '@/components/ui/button'

export type ReasonRow = {
  reason: string
  clusters: number
  pages: number
  pending: number
  pendingEligible: number
  pendingRows: { cluster: number; title: string; id: string }[]
}

export type DedupeSummaryStats = {
  totalClusters: number
  totalPages: number
  deletionCandidates: number
  archivedCount: number
  pendingCount: number
  pendingEligibleCount: number
  byReason: ReasonRow[]
}

export function computeSummary(
  report: DedupeReport,
  decisions: Decisions,
  isEligible: (p: DedupePage) => boolean,
): DedupeSummaryStats {
  let totalPages = 0
  let deletionCandidates = 0
  let archivedCount = 0
  let pendingCount = 0
  let pendingEligibleCount = 0
  const reasonMap = new Map<string, ReasonRow>()

  for (const c of report) {
    const keepId = pickKeepId(c)
    totalPages += c.pages.length
    if (!reasonMap.has(c.reason)) {
      reasonMap.set(c.reason, { reason: c.reason, clusters: 0, pages: 0, pending: 0, pendingEligible: 0, pendingRows: [] })
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
        if (isEligible(p)) {
          pendingEligibleCount += 1
          row.pendingEligible += 1
          row.pendingRows.push({ cluster: c.cluster, title: p.title, id: p.id })
        }
      }
    }
  }

  return {
    totalClusters: report.length,
    totalPages,
    deletionCandidates,
    archivedCount,
    pendingCount,
    pendingEligibleCount,
    byReason: Array.from(reasonMap.values()).sort((a, b) => b.pendingEligible - a.pendingEligible),
  }
}

export function DedupeSummary({
  report,
  decisions,
  busy,
  isEligible,
  onArchiveReason,
}: {
  report: DedupeReport
  decisions: Decisions
  busy: boolean
  isEligible: (p: DedupePage) => boolean
  onArchiveReason: (row: ReasonRow) => void
}) {
  const stats = useMemo(() => computeSummary(report, decisions, isEligible), [report, decisions, isEligible])
  const ineligiblePending = stats.pendingCount - stats.pendingEligibleCount

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="text-sm">
        <strong>{stats.totalClusters.toLocaleString()}</strong> clusters ·{' '}
        <strong>{stats.totalPages.toLocaleString()}</strong> pages ·{' '}
        <strong>{stats.deletionCandidates.toLocaleString()}</strong> candidates ·{' '}
        <strong>{stats.archivedCount.toLocaleString()}</strong> archived ·{' '}
        <strong>{stats.pendingEligibleCount.toLocaleString()}</strong> eligible pending
        {ineligiblePending > 0 && (
          <span className="text-muted-foreground"> · {ineligiblePending.toLocaleString()} below threshold (excluded)</span>
        )}
      </div>
      {stats.byReason.length > 0 && (
        <div className="space-y-1.5">
          {stats.byReason.map((r) => {
            const excluded = r.pending - r.pendingEligible
            return (
              <div key={r.reason} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <span className="font-medium">{r.reason}</span>
                  <span className="text-muted-foreground">
                    : {r.clusters.toLocaleString()} clusters · {r.pages.toLocaleString()} pages ·{' '}
                    <strong className="text-foreground">{r.pendingEligible.toLocaleString()}</strong> eligible pending
                    {excluded > 0 ? ` (${excluded.toLocaleString()} excluded)` : ''}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || r.pendingEligible === 0}
                  onClick={() => onArchiveReason(r)}
                >
                  Archive eligible pending ({r.pendingEligible.toLocaleString()})
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
