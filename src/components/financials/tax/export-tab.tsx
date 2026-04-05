'use client'

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Download, Loader2, AlertCircle, CheckCircle2, History } from 'lucide-react'
import type { ExportProgressEvent, ExportJob } from '@/types/financials'

export function ExportTab({ fy }: { fy: string }) {
  const [generating, setGenerating] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [progressStep, setProgressStep] = useState<string>('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<ExportJob[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    loadHistory()
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close()
    }
  }, [])

  async function loadHistory() {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/financials/tax/export/history')
      if (res.ok) {
        const data = await res.json()
        setHistory(data.jobs || [])
      }
    } finally {
      setHistoryLoading(false)
    }
  }

  async function startExport() {
    setError(null)
    setDownloadUrl(null)
    setProgressStep('Starting…')
    setProgressPercent(0)
    setGenerating(true)

    try {
      const res = await fetch('/api/financials/tax/export/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fy }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to start export')
      }
      const { jobId: id } = await res.json()
      setJobId(id)

      const es = new EventSource(`/api/financials/tax/export/${id}/stream`)
      eventSourceRef.current = es

      es.onmessage = (ev) => {
        try {
          const event: ExportProgressEvent = JSON.parse(ev.data)
          if (event.type === 'progress') {
            setProgressStep(event.step ?? '')
            setProgressPercent(event.percent ?? 0)
          } else if (event.type === 'complete') {
            setDownloadUrl(event.blobUrl ?? null)
            setProgressStep('Complete')
            setProgressPercent(100)
            setGenerating(false)
            es.close()
            loadHistory()
            toast.success('Accountant pack ready to download')
          } else if (event.type === 'error') {
            setError(event.message ?? 'Unknown error')
            setGenerating(false)
            es.close()
            toast.error(event.message ?? 'Export failed')
          }
        } catch (err) {
          console.error('SSE parse error:', err)
        }
      }

      es.onerror = () => {
        setError('Connection lost. Check the export history below.')
        setGenerating(false)
        es.close()
      }
    } catch (err: any) {
      setError(err.message || String(err))
      setGenerating(false)
      toast.error(err.message || 'Failed to start export')
    }
  }

  async function cancelExport() {
    if (!jobId) return
    try {
      await fetch(`/api/financials/tax/export/${jobId}/cancel`, { method: 'POST' })
      if (eventSourceRef.current) eventSourceRef.current.close()
      setGenerating(false)
      setProgressStep('Cancelled')
      toast('Export cancelled')
    } catch {
      toast.error('Failed to cancel')
    }
  }

  return (
    <div className="space-y-6">
      {/* Generate */}
      <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Generate Accountant Pack</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Build a ZIP for <span className="font-medium">{fy}</span> with all entities included.
          </p>
        </div>

        {!generating && !downloadUrl && !error && (
          <button
            onClick={startExport}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
          >
            <Download className="h-4 w-4" /> Generate Accountant Pack
          </button>
        )}

        {generating && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{progressStep || 'Starting…'}</span>
              </div>
              <span className="text-muted-foreground">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <button
              onClick={cancelExport}
              className="text-xs text-red-600 hover:text-red-700 underline"
            >
              Cancel
            </button>
          </div>
        )}

        {downloadUrl && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-900">Your pack is ready</p>
                <p className="text-xs text-green-700">
                  Link expires in 1 hour. Download before it expires.
                </p>
              </div>
            </div>
            <a
              href={downloadUrl}
              download
              className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-1.5 rounded-md"
            >
              <Download className="h-3.5 w-3.5" /> Download ZIP
            </a>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">Export failed</p>
              <p className="text-xs text-red-700 mt-0.5">{error}</p>
              <button
                onClick={() => {
                  setError(null)
                  setDownloadUrl(null)
                  setJobId(null)
                }}
                className="text-xs text-red-700 underline mt-2"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-gray-900">Recent exports</h3>
        </div>
        {historyLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No exports yet. Click Generate above to create your first.
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <StatusBadge status={job.status} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{job.fy}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {job.createdAt ? new Date(job.createdAt).toLocaleString('en-AU') : '—'}
                    </p>
                  </div>
                </div>
                {job.blobUrl && job.status === 'complete' && !(job as any).expired && (
                  <a
                    href={job.blobUrl}
                    download
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Download
                  </a>
                )}
                {(job as any).expired && (
                  <span className="text-[11px] text-muted-foreground italic">expired</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; classes: string }> = {
    complete: { label: '✓', classes: 'bg-green-100 text-green-700' },
    running: { label: '…', classes: 'bg-blue-100 text-blue-700' },
    pending: { label: '…', classes: 'bg-gray-100 text-gray-700' },
    error: { label: '✕', classes: 'bg-red-100 text-red-700' },
    cancelled: { label: '—', classes: 'bg-gray-100 text-gray-500' },
  }
  const c = cfg[status] ?? cfg.pending
  return (
    <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${c.classes}`}>
      {c.label}
    </span>
  )
}
