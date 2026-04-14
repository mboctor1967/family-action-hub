'use client'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { type DedupeReport } from '@/lib/notion/dedupe-schema'

export function DedupePreviewDialog({
  open,
  onClose,
  onConfirm,
  selected,
  report,
  busy,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  selected: Set<string>
  report: DedupeReport
  busy: boolean
}) {
  const rows: { cluster: number; title: string }[] = []
  for (const c of report) {
    for (const p of c.pages) if (selected.has(p.id)) rows.push({ cluster: c.cluster, title: p.title })
  }
  const clusters = new Set(rows.map((r) => r.cluster)).size
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview archive</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          This will archive <strong>{rows.length}</strong> pages across <strong>{clusters}</strong> clusters.
          Archived pages land in Notion trash and can be restored within 30 days.
        </p>
        <ul className="max-h-64 overflow-y-auto text-xs space-y-1 rounded border p-2">
          {rows.map((r, i) => (
            <li key={i} className="truncate">
              <span className="text-muted-foreground">C{r.cluster}</span> — {r.title || '(untitled)'}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy}>{busy ? 'Archiving…' : 'Confirm archive'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
