'use client'

import { useEffect, useState } from 'react'
import { Loader2, FileText, ExternalLink, AlertCircle } from 'lucide-react'
import type { InvoiceFile } from '@/types/financials'

interface Entity {
  id: string
  name: string
  type: 'personal' | 'business' | 'trust'
  invoiceDriveFolder: string | null
}

export function InvoicesTab({ fy }: { fy: string }) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [files, setFiles] = useState<InvoiceFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/financials/entities')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: Entity[] | { entities?: Entity[] }) => {
        const list = Array.isArray(d) ? d : d.entities ?? []
        setEntities(list)
        const firstWithFolder = list.find((e) => e.invoiceDriveFolder)
        if (firstWithFolder) setSelectedEntityId(firstWithFolder.id)
      })
      .catch(() => setError('Failed to load entities'))
  }, [])

  useEffect(() => {
    if (!selectedEntityId) return
    setLoading(true)
    setError(null)
    fetch(`/api/financials/tax/invoices?entityId=${selectedEntityId}&fy=${fy}`)
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to load invoices')
        }
        return r.json()
      })
      .then((d: { files: InvoiceFile[] }) => setFiles(d.files))
      .catch((e: Error) => {
        setFiles([])
        setError(e.message)
      })
      .finally(() => setLoading(false))
  }, [selectedEntityId, fy])

  if (entities.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No entities configured. Add one in{' '}
        <a href="/financials/accounts" className="text-blue-600 underline">
          Accounts & Entities
        </a>
        .
      </div>
    )
  }

  const selected = entities.find((e) => e.id === selectedEntityId)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Entity</label>
        <select
          value={selectedEntityId ?? ''}
          onChange={(e) => setSelectedEntityId(e.target.value)}
          className="text-sm border border-border rounded-md px-2 py-1 bg-white"
        >
          <option value="">Select…</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {!e.invoiceDriveFolder && ' (no Drive folder)'}
            </option>
          ))}
        </select>
      </div>

      {selected && !selected.invoiceDriveFolder && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">No Drive folder configured</p>
            <p className="text-amber-700 mt-1">
              Add an "Invoice Drive folder path" to this entity in{' '}
              <a href="/financials/accounts" className="underline">
                Accounts &amp; Entities
              </a>
              . The export will scan that folder for supplier invoices.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Scanning Drive folder…
        </div>
      )}

      {!loading && files.length > 0 && (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-gray-50">
            <p className="text-sm font-medium text-gray-900">
              {files.length} file{files.length > 1 ? 's' : ''} found in Drive folder
            </p>
          </div>
          <div className="divide-y divide-border">
            {files.map((file) => (
              <div key={file.gdriveFileId} className="px-4 py-3 flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.filename}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {file.modifiedTime.slice(0, 10)}
                    {file.tag?.supplier && ` · ${file.tag.supplier}`}
                    {file.tag?.linkedTxnId && ` · linked to txn`}
                  </p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                  file.tag?.matchStatus === 'matched'
                    ? 'bg-green-100 text-green-700'
                    : file.tag?.matchStatus === 'verified'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {file.tag?.matchStatus ?? 'unmatched'}
                </span>
                {file.driveUrl && (
                  <a
                    href={file.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-blue-600"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && selected?.invoiceDriveFolder && files.length === 0 && !error && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No invoice files found in the Drive folder for {selected.name}.
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Inline tagging UI (match files to transactions) ships in v0.1.3. For now, the export bundles
        every file from the Drive folder and generates an unmatched invoices-index.csv for the
        accountant to cross-reference.
      </p>
    </div>
  )
}
