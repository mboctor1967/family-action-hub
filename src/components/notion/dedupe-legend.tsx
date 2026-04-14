'use client'
import { useSyncExternalStore } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { type DedupeCluster } from '@/lib/notion/dedupe-schema'

const KEY = 'notion-dedupe-legend-collapsed'

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}
function getSnapshot() {
  return localStorage.getItem(KEY) !== '0'
}
function getServerSnapshot() {
  return true
}

const ENTRIES: { reason: string; confidence: number; text: string }[] = [
  {
    reason: 'identical body',
    confidence: 100,
    text: 'bodies are byte-for-byte the same after whitespace/punctuation normalization. Almost always true duplicates — integrations re-creating pages, or manual duplicates left behind.',
  },
  {
    reason: 'same title + similar body',
    confidence: 90,
    text: 'titles match and bodies overlap ≥80% measured by 5-word text shingles (Jaccard similarity). Usually the same note edited slightly across copies.',
  },
  {
    reason: 'same title, empty bodies',
    confidence: 70,
    text: 'titles match and every page in the cluster has a body shorter than 20 characters (essentially empty). Not strictly "the same page", but all placeholder stubs. Commonly mobile \u2018New Note\u2019 taps that never got content.',
  },
]

export function DedupeLegend() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const toggle = () => {
    const next = !collapsed
    localStorage.setItem(KEY, next ? '1' : '0')
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
  }
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm">
      <button onClick={toggle} className="flex items-center gap-1 font-medium">
        What do these mean? {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
      {!collapsed && (
        <ul className="mt-3 space-y-2 text-muted-foreground">
          {ENTRIES.map((e) => (
            <li key={e.reason} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
              <div className="shrink-0">
                <Badge variant="outline">{e.reason}</Badge>{' '}
                <span className="text-xs">({e.confidence}% confidence)</span>
              </div>
              <span>— {e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
}

function truncate(s: string, max = 40): string {
  if (!s) return '(untitled)'
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s
}

export function explainCluster(cluster: DedupeCluster): string {
  const n = cluster.pages.length
  const medianLen = median(cluster.pages.map((p) => p.bodyLen))
  const sharedTitle = truncate(cluster.pages[0].title || '')
  switch (cluster.reason) {
    case 'identical body':
      return `${n} pages with byte-identical bodies (~${medianLen} chars each). Very likely true duplicates.`
    case 'same title + similar body':
      return `${n} pages titled '${sharedTitle}' with \u226580% overlapping body text (~${medianLen} chars each).`
    case 'same title, empty bodies':
      return `${n} blank pages titled '${sharedTitle}'. Typically stray 'New Note' taps or pages whose content got blanked.`
    default:
      return `${n} pages clustered by ${cluster.reason}.`
  }
}
