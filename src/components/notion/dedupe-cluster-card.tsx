'use client'
import { type DedupeCluster, type Decisions } from '@/lib/notion/dedupe-schema'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, RotateCcw } from 'lucide-react'

export type ClusterCardProps = {
  cluster: DedupeCluster
  keepId: string
  decisions: Decisions
  selected: Set<string>
  onToggle: (pageId: string) => void
  onRetry: (pageId: string) => void
}

export function DedupeClusterCard({ cluster, keepId, decisions, selected, onToggle, onRetry }: ClusterCardProps) {
  const allArchived = cluster.pages.every(
    (p) => p.id === keepId || decisions[p.id]?.status === 'archived',
  )
  const [collapsed, setCollapsed] = useState(allArchived)

  return (
    <div className="rounded-lg border">
      <button className="w-full flex items-center justify-between p-3" onClick={() => setCollapsed(!collapsed)}>
        <div className="flex items-center gap-2 text-sm">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <strong>Cluster {cluster.cluster}</strong>
          <span className="text-muted-foreground">— {cluster.pages[0].title.slice(0, 60)}</span>
          <Badge variant="outline">{cluster.pages.length} pages</Badge>
          <Badge variant="outline">{cluster.confidence}%</Badge>
          {allArchived && <Badge className="bg-green-100 text-green-700">all archived</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">{cluster.reason}</span>
      </button>
      {!collapsed && (
        <div className="divide-y">
          {cluster.pages.map((p) => {
            const isKeep = p.id === keepId
            const dec = decisions[p.id]
            const isArchived = dec?.status === 'archived'
            const isFailed = dec?.status === 'failed'
            return (
              <div key={p.id} className={`flex items-center gap-3 p-3 text-sm ${isArchived ? 'opacity-50' : ''}`}>
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
                <a href={p.url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">
                  {p.title || '(untitled)'}
                </a>
                <span className="text-xs text-muted-foreground tabular-nums">{p.bodyLen}ch</span>
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
