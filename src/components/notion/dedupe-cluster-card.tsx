'use client'
import { type DedupeCluster, type DedupePage, type Decisions } from '@/lib/notion/dedupe-schema'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, RotateCcw, Image as ImageIcon, Paperclip, Link as LinkIcon } from 'lucide-react'
import { explainCluster } from './dedupe-legend'

export type ClusterCardProps = {
  cluster: DedupeCluster
  keepId: string
  decisions: Decisions
  selected: Set<string>
  collapsed: boolean
  busy: boolean
  isEligible: (p: DedupePage) => boolean
  hideIneligible: boolean
  onToggle: (pageId: string) => void
  onRetry: (pageId: string) => void
  onToggleCollapse: (clusterNum: number) => void
  onArchiveCluster: (clusterNum: number) => void
}

export function DedupeClusterCard({
  cluster,
  keepId,
  decisions,
  selected,
  collapsed,
  busy,
  isEligible,
  hideIneligible,
  onToggle,
  onRetry,
  onToggleCollapse,
  onArchiveCluster,
}: ClusterCardProps) {
  const allArchived = cluster.pages.every(
    (p) => p.id === keepId || decisions[p.id]?.status === 'archived',
  )
  const pendingEligibleCount = cluster.pages.filter(
    (p) => p.id !== keepId && decisions[p.id]?.status !== 'archived' && isEligible(p),
  ).length
  const pendingTotal = cluster.pages.filter(
    (p) => p.id !== keepId && decisions[p.id]?.status !== 'archived',
  ).length
  const pendingExcluded = pendingTotal - pendingEligibleCount
  const visiblePages = cluster.pages.filter((p) => {
    if (!hideIneligible) return true
    if (p.id === keepId) return true
    if (decisions[p.id]?.status === 'archived') return true
    return isEligible(p)
  })

  return (
    <div className="rounded-lg border">
      <div className="w-full flex items-center justify-between p-3 gap-3">
        <button
          className="flex items-center gap-2 text-sm flex-1 min-w-0 text-left"
          onClick={() => onToggleCollapse(cluster.cluster)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          <strong>Cluster {cluster.cluster}</strong>
          <span className="text-muted-foreground truncate">— {cluster.pages[0].title.slice(0, 60)}</span>
          <Badge variant="outline">{cluster.pages.length} pages</Badge>
          <Badge variant="outline">{cluster.confidence}%</Badge>
          {allArchived && <Badge className="bg-green-100 text-green-700">all archived</Badge>}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {cluster.reason}
            {pendingExcluded > 0 && ` · ${pendingExcluded} below threshold`}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || pendingEligibleCount === 0}
            onClick={() => onArchiveCluster(cluster.cluster)}
          >
            Archive eligible ({pendingEligibleCount})
          </Button>
        </div>
      </div>
      <div className="p-3 pt-0 text-xs text-muted-foreground">{explainCluster(cluster)}</div>
      {!collapsed && (
        <div className="divide-y">
          {visiblePages.map((p) => {
            const isKeep = p.id === keepId
            const dec = decisions[p.id]
            const isArchived = dec?.status === 'archived'
            const isFailed = dec?.status === 'failed'
            const ineligible = !isKeep && !isArchived && !isEligible(p)
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 p-3 text-sm ${isArchived ? 'opacity-50' : ''} ${
                  ineligible ? 'bg-amber-50/60' : ''
                }`}
              >
                <div className="w-6">
                  {isKeep ? (
                    <Checkbox checked disabled aria-label="KEEP (locked)" />
                  ) : isArchived ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : isFailed ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : (
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => onToggle(p.id)}
                      aria-label={`Select DELETE ${p.title}`}
                    />
                  )}
                </div>
                <Badge variant={isKeep ? 'default' : 'secondary'}>{isKeep ? 'KEEP' : 'DELETE'}</Badge>
                {ineligible && (
                  <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 text-[10px]">
                    below threshold
                  </Badge>
                )}
                <a href={p.url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">
                  {p.title || '(untitled)'}
                </a>
                <span className="text-xs text-muted-foreground tabular-nums" title={`${p.bodyLen} chars, ${p.blockCount ?? 0} blocks`}>
                  {p.bodyLen}ch · {p.blockCount ?? 0}b
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                  {(p.imageCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5" title={`${p.imageCount} image(s)`}>
                      <ImageIcon className="h-3 w-3" />{p.imageCount}
                    </span>
                  )}
                  {(p.fileCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5" title={`${p.fileCount} file/pdf/video`}>
                      <Paperclip className="h-3 w-3" />{p.fileCount}
                    </span>
                  )}
                  {(p.embedCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5" title={`${p.embedCount} embed/bookmark`}>
                      <LinkIcon className="h-3 w-3" />{p.embedCount}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{p.edited.slice(0, 10)}</span>
                {isFailed && (
                  <button onClick={() => onRetry(p.id)} className="text-red-600 hover:underline flex items-center gap-1 text-xs" title={dec?.error}>
                    <RotateCcw className="h-3 w-3" /> retry
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
