'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Upload,
  FolderSearch,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Loader2,
  Eye,
  FileText,
  FileWarning,
} from 'lucide-react'
import type { ScanResult, DriveFile } from '@/types/financials'

// Preview metadata for a file
interface FilePreview {
  file_id: string
  file_name: string
  size: number
  page_count: number
  status: 'readable' | 'needs_ocr' | 'error'
  bank: string | null
  account_hint: string | null
  bsb: string | null
  period: string | null
  text_length: number
  error?: string
}

type IngestFileStatus = {
  name: string
  status: 'pending' | 'parsing' | 'parsed' | 'needs_review' | 'error' | 'duplicate'
  error?: string
}

interface IngestComplete {
  total: number
  success: number
  errors: number
  needs_review: number
  total_cost: number
  model_used: string
}

export function IngestPanel({ onComplete }: { onComplete?: () => void }) {
  const [open, setOpen] = useState(false)

  // Step 1: Scan
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  // Step 2: Preview
  const [previewing, setPreviewing] = useState(false)
  const [previews, setPreviews] = useState<FilePreview[]>([])
  const [previewProgress, setPreviewProgress] = useState({ done: 0, total: 0 })

  // Step 3: Selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bankFilter, setBankFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Step 4: Ingest
  const [ingesting, setIngesting] = useState(false)
  const [fileStatuses, setFileStatuses] = useState<IngestFileStatus[]>([])
  const [ingestResult, setIngestResult] = useState<IngestComplete | null>(null)
  const [currentCost, setCurrentCost] = useState(0)

  const [error, setError] = useState<string | null>(null)

  // Derived data
  const banks = useMemo(() => {
    const set = new Set(previews.map((p) => p.bank).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [previews])

  const filteredPreviews = useMemo(() => {
    return previews.filter((p) => {
      if (bankFilter !== 'all' && p.bank !== bankFilter) return false
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      return true
    })
  }, [previews, bankFilter, statusFilter])

  const selectedCount = selected.size
  const selectedReadable = previews.filter((p) => selected.has(p.file_id) && p.status === 'readable').length

  // Step 1: Scan Google Drive
  async function handleScan() {
    setScanning(true)
    setError(null)
    setScanResult(null)
    setPreviews([])
    setSelected(new Set())
    setIngestResult(null)
    setFileStatuses([])

    try {
      const res = await fetch('/api/financials/scan', { method: 'POST' })
      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) } catch { setError(`Scan failed: ${text.slice(0, 200)}`); return }
      if (!res.ok) { setError(data.error || 'Scan failed'); return }
      setScanResult(data as ScanResult)

      // Auto-start preview if there are new files
      if (data.new_files?.length > 0) {
        handlePreview(data.new_files)
      }
    } catch (err: any) {
      setError(err.message || 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  // Step 2: Preview files (extract metadata)
  async function handlePreview(files: DriveFile[]) {
    setPreviewing(true)
    setPreviews([])
    setPreviewProgress({ done: 0, total: files.length })

    try {
      const res = await fetch('/api/financials/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      })

      if (!res.ok) {
        const text = await res.text()
        let msg = 'Preview failed'
        try { msg = JSON.parse(text).error || msg } catch { msg = text.slice(0, 200) || msg }
        setError(msg)
        setPreviewing(false)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const accumulated: FilePreview[] = []
      const autoSelected = new Set<string>()

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.file_id) {
                accumulated.push(data as FilePreview)
                // Auto-select readable files
                if (data.status === 'readable') {
                  autoSelected.add(data.file_id)
                }
                setPreviews([...accumulated])
                setPreviewProgress({ done: accumulated.length, total: files.length })
              }
            } catch {}
          }
        }
      }

      setSelected(autoSelected)
    } catch (err: any) {
      setError(err.message || 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  // Selection helpers
  function toggleFile(fileId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filteredPreviews.map((p) => p.file_id)))
  }

  function deselectAll() {
    // Only deselect filtered ones
    setSelected((prev) => {
      const next = new Set(prev)
      filteredPreviews.forEach((p) => next.delete(p.file_id))
      return next
    })
  }

  function selectReadableOnly() {
    setSelected(new Set(previews.filter((p) => p.status === 'readable').map((p) => p.file_id)))
  }

  // Step 4: Ingest selected files
  async function handleIngest() {
    if (selected.size === 0) return

    setIngesting(true)
    setError(null)
    setIngestResult(null)
    setCurrentCost(0)

    const selectedFiles = previews.filter((p) => selected.has(p.file_id))
    const fileNames: Record<string, string> = {}
    selectedFiles.forEach((f) => { fileNames[f.file_id] = f.file_name })

    setFileStatuses(selectedFiles.map((f) => ({ name: f.file_name, status: 'pending' })))

    try {
      const res = await fetch('/api/financials/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_ids: selectedFiles.map((f) => f.file_id),
          file_names: fileNames,
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        let msg = 'Ingest failed'
        try { msg = JSON.parse(text).error || msg } catch { msg = text.slice(0, 200) || msg }
        setError(msg)
        setIngesting(false)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'progress' || data.status) {
                setFileStatuses((prev) => {
                  const updated = [...prev]
                  const idx = (data.current || 1) - 1
                  if (idx >= 0 && idx < updated.length) {
                    updated[idx] = {
                      name: data.file_name || updated[idx].name,
                      status: data.status || 'parsing',
                      error: data.error_message,
                    }
                  }
                  return updated
                })
                if (data.estimated_cost) setCurrentCost(data.estimated_cost)
              }
              if (data.type === 'complete') {
                setIngestResult(data)
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Ingest failed')
    } finally {
      setIngesting(false)
      onComplete?.()
    }
  }

  function reset() {
    setScanResult(null)
    setPreviews([])
    setSelected(new Set())
    setFileStatuses([])
    setIngestResult(null)
    setError(null)
    setCurrentCost(0)
    setBankFilter('all')
    setStatusFilter('all')
    setPreviewProgress({ done: 0, total: 0 })
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'parsed': return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />
      case 'needs_review': return <AlertTriangle className="h-4 w-4 text-amber-500" />
      case 'duplicate': return <Copy className="h-4 w-4 text-gray-400" />
      case 'parsing': return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case 'readable': return <FileText className="h-4 w-4 text-green-600" />
      case 'needs_ocr': return <FileWarning className="h-4 w-4 text-amber-500" />
      default: return <div className="h-4 w-4 rounded-full border-2 border-gray-200" />
    }
  }

  // Determine which step we're showing
  const showScan = !scanResult && !ingestResult
  const showSelection = scanResult && previews.length > 0 && !ingesting && !ingestResult
  const showIngesting = ingesting || ingestResult

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <SheetTrigger
        className="inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium h-8 px-3 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
      >
        <Upload className="h-4 w-4" />
        Import Statements
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Import Bank Statements</SheetTitle>
          <SheetDescription>
            Scan your Google Drive folder, preview files, select which to import.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Step 1: Scan */}
          {showScan && (
            <div className="text-center py-8 space-y-4">
              <FolderSearch className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Scan your Google Drive folder to find new bank statement PDFs.
              </p>
              <Button onClick={handleScan} disabled={scanning} className="gap-2">
                {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
                {scanning ? 'Scanning...' : 'Scan Google Drive'}
              </Button>
            </div>
          )}

          {/* Previewing progress */}
          {previewing && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  Previewing files...
                </span>
                <span>{previewProgress.done} / {previewProgress.total}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${previewProgress.total > 0 ? (previewProgress.done / previewProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Step 2+3: Selection table */}
          {showSelection && (
            <div className="space-y-3">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-green-50 rounded-lg p-2.5 text-center">
                  <p className="text-xl font-bold text-green-700">{scanResult.new_files.length}</p>
                  <p className="text-[10px] text-green-600">New files</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                  <p className="text-xl font-bold text-gray-600">{scanResult.already_imported.length}</p>
                  <p className="text-[10px] text-gray-500">Already imported</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                  <p className="text-xl font-bold text-amber-600">{previews.filter((p) => p.status === 'needs_ocr').length}</p>
                  <p className="text-[10px] text-amber-500">Need OCR</p>
                </div>
              </div>

              {/* Filters + bulk actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={bankFilter} onValueChange={(v) => v && setBankFilter(v)}>
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue placeholder="All banks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All banks</SelectItem>
                    {banks.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="readable">Readable</SelectItem>
                    <SelectItem value="needs_ocr">Needs OCR</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex gap-1 ml-auto">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll}>
                    All
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectReadableOnly}>
                    Readable
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={deselectAll}>
                    None
                  </Button>
                </div>
              </div>

              {/* File list with checkboxes */}
              <ScrollArea className="max-h-[340px]">
                <div className="space-y-0.5">
                  {filteredPreviews.map((p) => (
                    <div
                      key={p.file_id}
                      className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleFile(p.file_id)}
                    >
                      <Checkbox
                        checked={selected.has(p.file_id)}
                        onCheckedChange={() => toggleFile(p.file_id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {statusIcon(p.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{p.file_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.bank && (
                            <Badge variant="secondary" className="text-[10px] py-0">{p.bank}</Badge>
                          )}
                          {p.period && (
                            <span className="text-[10px] text-muted-foreground">{p.period}</span>
                          )}
                          {p.account_hint && (
                            <span className="text-[10px] text-muted-foreground">••{p.account_hint.slice(-4)}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${
                            p.status === 'readable' ? 'bg-green-100 text-green-700' :
                            p.status === 'needs_ocr' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}
                        >
                          {p.status === 'readable' ? 'readable' : p.status === 'needs_ocr' ? 'needs OCR' : 'error'}
                        </Badge>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {p.page_count}pg / {(p.size / 1024).toFixed(0)}KB
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Selection summary + import button */}
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{selectedCount} file{selectedCount !== 1 ? 's' : ''} selected ({selectedReadable} readable)</span>
                  <span>Est. cost: ~${(selectedReadable * 0.014).toFixed(2)} (haiku) / ~${(selectedReadable * 0.05).toFixed(2)} (sonnet)</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleIngest}
                    disabled={selectedCount === 0}
                    className="flex-1 gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Import {selectedCount} File{selectedCount !== 1 ? 's' : ''}
                  </Button>
                  <Button variant="outline" onClick={reset}>Cancel</Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Ingest progress */}
          {showIngesting && fileStatuses.length > 0 && (
            <div className="space-y-4">
              {ingesting && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Processing...</span>
                    <span>Cost: ${currentCost.toFixed(3)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{
                        width: `${(fileStatuses.filter((f) => f.status !== 'pending').length / fileStatuses.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {ingestResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                  <p className="text-sm font-medium text-green-800">Import complete</p>
                  <div className="text-xs text-green-700 space-y-0.5">
                    <p>{ingestResult.success} parsed successfully</p>
                    {ingestResult.errors > 0 && <p>{ingestResult.errors} errors</p>}
                    {ingestResult.needs_review > 0 && <p>{ingestResult.needs_review} need review</p>}
                    <p>Total cost: ${ingestResult.total_cost.toFixed(3)} ({ingestResult.model_used})</p>
                  </div>
                </div>
              )}

              <ScrollArea className="max-h-64">
                <div className="space-y-1.5">
                  {fileStatuses.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1">
                      {statusIcon(f.status)}
                      <span className="truncate flex-1">{f.name}</span>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] shrink-0 ${
                          f.status === 'parsed' ? 'bg-green-100 text-green-700' :
                          f.status === 'error' ? 'bg-red-100 text-red-700' :
                          f.status === 'needs_review' ? 'bg-amber-100 text-amber-700' :
                          f.status === 'duplicate' ? 'bg-gray-100 text-gray-500' :
                          f.status === 'parsing' ? 'bg-blue-100 text-blue-700' :
                          ''
                        }`}
                      >
                        {f.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {ingestResult && (
                <Button onClick={() => { reset(); setOpen(false) }} className="w-full">
                  Done
                </Button>
              )}
            </div>
          )}

          {/* No new files */}
          {scanResult && scanResult.new_files.length === 0 && !previewing && (
            <div className="text-center py-8 space-y-2">
              <CheckCircle2 className="h-10 w-10 mx-auto text-green-500" />
              <p className="text-sm text-muted-foreground">All files already imported. Nothing new to process.</p>
              <Button variant="outline" onClick={reset}>Done</Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
