import Link from 'next/link'

type Report = {
  id: string
  uploadedAt: string
  filename: string
  scanTimestamp: string
  totalClusters: number
  totalPages: number
  archivedCount: number
}

export function DedupeReportsList({ reports }: { reports: Report[] }) {
  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">No reports uploaded yet.</p>
  }
  return (
    <ul className="divide-y rounded-lg border">
      {reports.map((r) => (
        <li key={r.id} className="p-4 hover:bg-muted/30">
          <Link href={`/notion/dedupe/${r.id}`} className="flex items-center justify-between">
            <div>
              <div className="font-medium">{new Date(r.uploadedAt).toLocaleString('en-AU')}</div>
              <div className="text-xs text-muted-foreground">{r.filename}</div>
            </div>
            <div className="text-sm text-right">
              <div>
                <strong>{Math.max(0, r.totalPages - r.totalClusters - r.archivedCount).toLocaleString()}</strong> pending deletes
              </div>
              <div className="text-xs text-muted-foreground">
                {r.totalClusters.toLocaleString()} clusters · {r.totalPages.toLocaleString()} pages ·{' '}
                {Math.max(0, r.totalPages - r.totalClusters).toLocaleString()} candidates · {r.archivedCount.toLocaleString()} archived
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
