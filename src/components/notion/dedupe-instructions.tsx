'use client'
import { useSyncExternalStore } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

const KEY = 'notion-dedupe-instructions-collapsed'

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}
function getSnapshot() {
  return localStorage.getItem(KEY) === '1'
}
function getServerSnapshot() {
  return false
}

export function DedupeInstructions() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const toggle = () => {
    const next = !collapsed
    localStorage.setItem(KEY, next ? '1' : '0')
    // Trigger re-render for same-tab update
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
  }
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm">
      <button onClick={toggle} className="flex items-center gap-1 font-medium">
        How this works {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
      {!collapsed && (
        <ol className="mt-2 space-y-1 list-decimal list-inside text-muted-foreground">
          <li><strong>Scan</strong> — run <code>npm run dedupe:scan</code> in your terminal. Produces a JSON report in <code>scripts/reports/</code>. Takes 45–90 minutes (scanner now recurses into every child block to catch nested duplicates). Runs on your laptop because Vercel can&apos;t host long-running jobs.</li>
          <li><strong>Upload</strong> — click the button below and pick the JSON file.</li>
          <li><strong>Review</strong> — tick which DELETE rows to archive. KEEP rows are auto-picked (longest body, most recent edit) and locked.</li>
          <li><strong>Archive</strong> — preview, then confirm. Archived pages land in Notion trash (30-day restore).</li>
        </ol>
      )}
    </div>
  )
}
