'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  Upload,
  FolderSearch,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  FileText,
  FileWarning,
  Eye,
  Building2,
  Plus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { ScanResult, DriveFile } from '@/types/financials'

interface FilePreview {
  file_id: string
  file_name: string
  file_type?: 'pdf' | 'csv' | 'qfx'
  size: number
  page_count: number
  status: 'readable' | 'needs_ocr' | 'error'
  bank: string | null
  account_hint: string | null
  bsb: string | null
  period: string | null
  text_length: number
  transaction_count?: number
  format?: string | null
  extraction_method?: string
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

export function ImportView() {
  const router = useRouter()

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
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // Step 4: Ingest
  const [ingesting, setIngesting] = useState(false)
  const [fileStatuses, setFileStatuses] = useState<IngestFileStatus[]>([])
  const [ingestResult, setIngestResult] = useState<IngestComplete | null>(null)
  const [currentCost, setCurrentCost] = useState(0)

  const [error, setError] = useState<string | null>(null)
  const [scanFileTypes, setScanFileTypes] = useState<Set<string>>(new Set(['pdf', 'csv', 'qfx']))

  // Step 5: Post-import mapping
  const [showMapping, setShowMapping] = useState(false)
  const [mappingStatements, setMappingStatements] = useState<any[]>([])
  const [mappingAccounts, setMappingAccounts] = useState<any[]>([])
  const [mappingEntities, setMappingEntities] = useState<any[]>([])
  const [loadingMapping, setLoadingMapping] = useState(false)
  const [showNewAccountInline, setShowNewAccountInline] = useState(false)
  const [newAcctForm, setNewAcctForm] = useState({ bankName: '', accountName: '', bsb: '', accountNumber: '', accountType: 'personal_cheque', entityId: '' })

  // Derived
  const banks = useMemo(() => {
    const set = new Set(previews.map((p) => p.bank).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [previews])

  const filteredPreviews = useMemo(() => {
    return previews.filter((p) => {
      if (bankFilter !== 'all' && p.bank !== bankFilter) return false
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (typeFilter !== 'all' && (p.file_type || 'pdf') !== typeFilter) return false
      return true
    })
  }, [previews, bankFilter, statusFilter, typeFilter])

  const selectedCount = selected.size
  const selectedReadable = previews.filter((p) => selected.has(p.file_id) && p.status === 'readable').length
  const selectedFree = previews.filter((p) => selected.has(p.file_id) && ((p.file_type || 'pdf') === 'csv' || (p.file_type || 'pdf') === 'qfx')).length
  const selectedPDFs = selectedReadable - selectedFree  // only PDFs cost money

  // Step 1: Scan
  async function handleScan() {
    setScanning(true)
    setError(null)
    setScanResult(null)
    setPreviews([])
    setSelected(new Set())
    setIngestResult(null)
    setFileStatuses([])

    try {
      const res = await fetch('/api/financials/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileTypes: Array.from(scanFileTypes) }),
      })
      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) } catch { setError(`Scan failed: ${text.slice(0, 200)}`); return }
      if (!res.ok) { setError(data.error || 'Scan failed'); return }
      setScanResult(data as ScanResult)
      if (data.new_files?.length > 0) {
        handlePreview(data.new_files)
      }
    } catch (err: any) {
      setError(err.message || 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  // Step 2: Preview
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
                if (data.status === 'readable') autoSelected.add(data.file_id)
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

  // Selection
  function toggleFile(fileId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId); else next.add(fileId)
      return next
    })
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev)
      filteredPreviews.forEach((p) => next.add(p.file_id))
      return next
    })
  }

  function deselectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev)
      filteredPreviews.forEach((p) => next.delete(p.file_id))
      return next
    })
  }

  function selectReadableOnly() {
    setSelected(new Set(previews.filter((p) => p.status === 'readable').map((p) => p.file_id)))
  }

  const allFilteredSelected = filteredPreviews.length > 0 && filteredPreviews.every((p) => selected.has(p.file_id))

  // Step 4: Ingest
  async function handleIngest() {
    if (selected.size === 0) return
    setIngesting(true)
    setError(null)
    setIngestResult(null)
    setCurrentCost(0)

    const selectedFiles = previews.filter((p) => selected.has(p.file_id))
    const fileNames: Record<string, string> = {}
    const fileTypes: Record<string, string> = {}
    selectedFiles.forEach((f) => {
      fileNames[f.file_id] = f.file_name
      fileTypes[f.file_id] = f.file_type || 'pdf'
    })
    setFileStatuses(selectedFiles.map((f) => ({ name: f.file_name, status: 'pending' })))

    try {
      const res = await fetch('/api/financials/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_ids: selectedFiles.map((f) => f.file_id),
          file_names: fileNames,
          file_types: fileTypes,
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
                    updated[idx] = { name: data.file_name || updated[idx].name, status: data.status || 'parsing', error: data.error_message }
                  }
                  return updated
                })
                if (data.estimated_cost) setCurrentCost(data.estimated_cost)
              }
              if (data.type === 'complete') setIngestResult(data)
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Ingest failed')
    } finally {
      setIngesting(false)
    }
  }

  // Step 5: Post-import mapping
  async function loadMappingData() {
    setLoadingMapping(true)
    try {
      const [stmtRes, acctRes, entRes] = await Promise.all([
        fetch('/api/financials/statements'),
        fetch('/api/financials/accounts'),
        fetch('/api/financials/entities'),
      ])
      if (stmtRes.ok) setMappingStatements(await stmtRes.json())
      if (acctRes.ok) setMappingAccounts(await acctRes.json())
      if (entRes.ok) setMappingEntities(await entRes.json())
    } catch {}
    setLoadingMapping(false)
  }

  async function reassignStatement(stmtId: string, accountId: string | null) {
    try {
      const res = await fetch(`/api/financials/statements/${stmtId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      if (res.ok) {
        toast.success('Statement mapped')
        loadMappingData()
      }
    } catch { toast.error('Failed') }
  }

  async function createAccountInline() {
    if (!newAcctForm.bankName.trim()) { toast.error('Bank name required'); return }
    try {
      const res = await fetch('/api/financials/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newAcctForm,
          entityId: newAcctForm.entityId || null,
        }),
      })
      if (res.ok) {
        toast.success('Account created')
        setShowNewAccountInline(false)
        setNewAcctForm({ bankName: '', accountName: '', bsb: '', accountNumber: '', accountType: 'personal_cheque', entityId: '' })
        loadMappingData()
      } else {
        toast.error((await res.json()).error || 'Failed')
      }
    } catch { toast.error('Failed') }
  }

  function enterMappingStep() {
    setShowMapping(true)
    loadMappingData()
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'readable': return <Badge className="bg-green-100 text-green-700 text-[10px]">Readable</Badge>
      case 'needs_ocr': return <Badge className="bg-amber-100 text-amber-700 text-[10px]">Needs OCR</Badge>
      case 'error': return <Badge className="bg-red-100 text-red-700 text-[10px]">Error</Badge>
      case 'parsed': return <Badge className="bg-green-100 text-green-700 text-[10px]">Parsed</Badge>
      case 'parsing': return <Badge className="bg-blue-100 text-blue-700 text-[10px]">Parsing...</Badge>
      case 'needs_review': return <Badge className="bg-amber-100 text-amber-700 text-[10px]">Review</Badge>
      case 'duplicate': return <Badge className="bg-gray-100 text-gray-500 text-[10px]">Duplicate</Badge>
      case 'pending': return <Badge variant="secondary" className="text-[10px]">Pending</Badge>
      default: return <Badge variant="secondary" className="text-[10px]">{status}</Badge>
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / 1024).toFixed(0)} KB`
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/financials')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-xl font-bold">Import Bank Statements</h2>
        </div>
        {scanResult && !ingesting && !ingestResult && (
          <Button onClick={handleScan} variant="outline" size="sm" className="gap-1.5">
            <FolderSearch className="h-4 w-4" />
            Re-scan
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Initial scan */}
      {!scanResult && !ingesting && !ingestResult && (
        <div className="text-center py-16 space-y-5 bg-white rounded-xl border border-gray-100 shadow-sm">
          <FolderSearch className="h-16 w-16 mx-auto text-muted-foreground" />
          <div>
            <p className="text-lg font-medium">Scan Google Drive</p>
            <p className="text-sm text-muted-foreground mt-1">
              Find new bank statements in your configured folder and preview them before importing.
            </p>
          </div>
          <div className="flex items-center justify-center gap-4">
            <span className="text-xs font-medium text-muted-foreground">File types:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={scanFileTypes.has('pdf')}
                onCheckedChange={(checked) => {
                  setScanFileTypes((prev) => {
                    const next = new Set(prev)
                    checked ? next.add('pdf') : next.delete('pdf')
                    return next
                  })
                }}
              />
              <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-700">PDF</Badge>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={scanFileTypes.has('csv')}
                onCheckedChange={(checked) => {
                  setScanFileTypes((prev) => {
                    const next = new Set(prev)
                    checked ? next.add('csv') : next.delete('csv')
                    return next
                  })
                }}
              />
              <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700">CSV</Badge>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={scanFileTypes.has('qfx')}
                onCheckedChange={(checked) => {
                  setScanFileTypes((prev) => {
                    const next = new Set(prev)
                    checked ? next.add('qfx') : next.delete('qfx')
                    return next
                  })
                }}
              />
              <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700">QFX/OFX</Badge>
            </label>
          </div>
          <Button onClick={handleScan} disabled={scanning || scanFileTypes.size === 0} size="lg" className="gap-2">
            {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <FolderSearch className="h-5 w-5" />}
            {scanning ? 'Scanning...' : `Scan for ${Array.from(scanFileTypes).map(t => t.toUpperCase()).join(' + ')} files`}
          </Button>
        </div>
      )}

      {/* Preview progress */}
      {previewing && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-2 font-medium">
              <Eye className="h-4 w-4 text-blue-600" />
              Previewing files...
            </span>
            <span className="text-muted-foreground">{previewProgress.done} / {previewProgress.total}</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${previewProgress.total > 0 ? (previewProgress.done / previewProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Step 2+3: File selection table */}
      {scanResult && previews.length > 0 && !ingesting && !ingestResult && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-5 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
              <p className="text-2xl font-bold text-gray-800">{scanResult.total}</p>
              <p className="text-xs text-muted-foreground">Total in Drive</p>
            </div>
            <div className="bg-blue-50 rounded-xl border border-blue-100 p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">
                {previews.filter((p) => (p.file_type || 'pdf') === 'csv').length} / {previews.filter((p) => (p.file_type || 'pdf') === 'pdf').length}
              </p>
              <p className="text-xs text-blue-600">CSV / PDF</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-100 p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{previews.filter((p) => p.status === 'readable').length}</p>
              <p className="text-xs text-green-600">Readable</p>
            </div>
            <div className="bg-amber-50 rounded-xl border border-amber-100 p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{previews.filter((p) => p.status === 'needs_ocr').length}</p>
              <p className="text-xs text-amber-500">Needs OCR</p>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 text-center">
              <p className="text-2xl font-bold text-gray-500">{scanResult.already_imported.length}</p>
              <p className="text-xs text-gray-400">Already Imported</p>
            </div>
          </div>

          {/* Filters + bulk actions */}
          <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <span className="text-xs font-medium text-muted-foreground mr-1">Filter:</span>
            <Select value={bankFilter} onValueChange={(v) => v && setBankFilter(v)}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="All banks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All banks</SelectItem>
                {banks.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="qfx">QFX/OFX</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="readable">Readable</SelectItem>
                <SelectItem value="needs_ocr">Needs OCR</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-1.5 ml-auto">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={selectAllFiltered}>Select All</Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={selectReadableOnly}>Readable Only</Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={deselectAllFiltered}>Deselect All</Button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={() => allFilteredSelected ? deselectAllFiltered() : selectAllFiltered()}
                    />
                  </TableHead>
                  <TableHead className="text-xs">File Name</TableHead>
                  <TableHead className="text-xs text-center">Type</TableHead>
                  <TableHead className="text-xs">Bank</TableHead>
                  <TableHead className="text-xs">Account</TableHead>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs text-center">Pages / Txns</TableHead>
                  <TableHead className="text-xs text-right">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPreviews.map((p) => (
                  <TableRow
                    key={p.file_id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => toggleFile(p.file_id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(p.file_id)}
                        onCheckedChange={() => toggleFile(p.file_id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {p.status === 'readable' ? (
                          <FileText className="h-4 w-4 text-green-600 shrink-0" />
                        ) : p.status === 'needs_ocr' ? (
                          <FileWarning className="h-4 w-4 text-amber-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                        )}
                        <span className="text-xs font-medium truncate max-w-[250px]">{p.file_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className={`text-[10px] ${
                        (p.file_type || 'pdf') === 'csv' ? 'bg-blue-100 text-blue-700' :
                        (p.file_type || 'pdf') === 'qfx' ? 'bg-green-100 text-green-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {(p.file_type || 'pdf').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.bank ? (
                        <Badge variant="secondary" className="text-[10px]">{p.bank}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.account_hint ? (
                        <span className="text-xs text-muted-foreground font-mono">••{p.account_hint.slice(-4)}</span>
                      ) : p.bsb ? (
                        <span className="text-xs text-muted-foreground font-mono">{p.bsb}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.period ? (
                        <span className="text-xs">{p.period}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{statusBadge(p.status)}</TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {(p.file_type || 'pdf') === 'csv'
                        ? `${p.transaction_count || 0} txns`
                        : p.page_count ? `${p.page_count} pg` : '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatSize(p.size)}</TableCell>
                  </TableRow>
                ))}
                {filteredPreviews.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                      No files match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Import bar */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 rounded-xl shadow-lg p-4 flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{selectedCount}</span> file{selectedCount !== 1 ? 's' : ''} selected
              <span className="text-muted-foreground ml-2">
                ({selectedReadable} readable, {selectedCount - selectedReadable} OCR/error)
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">
                Est. cost: ~${(selectedPDFs * 0.014).toFixed(2)} (haiku) / ~${(selectedPDFs * 0.05).toFixed(2)} (sonnet){selectedFree > 0 ? ` + ${selectedFree} CSV/QFX free` : ''}
              </span>
              <Button
                onClick={handleIngest}
                disabled={selectedCount === 0}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Import {selectedCount} File{selectedCount !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* No new files */}
      {scanResult && scanResult.new_files.length === 0 && !previewing && !ingesting && !ingestResult && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm space-y-3">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
          <p className="text-lg font-medium">All up to date</p>
          <p className="text-sm text-muted-foreground">
            All {scanResult.already_imported.length} files in your Drive folder are already imported.
          </p>
          <Button variant="outline" onClick={() => router.push('/financials')}>Back to Financials</Button>
        </div>
      )}

      {/* Step 4: Ingest progress */}
      {(ingesting || ingestResult) && fileStatuses.length > 0 && (
        <div className="space-y-4">
          {ingesting && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  Importing statements...
                </span>
                <span className="text-muted-foreground">
                  {fileStatuses.filter((f) => f.status !== 'pending').length} / {fileStatuses.length} — Cost: ${currentCost.toFixed(3)}
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${(fileStatuses.filter((f) => f.status !== 'pending').length / fileStatuses.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {ingestResult && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="text-lg font-medium text-green-800">Import Complete</p>
              </div>
              <div className="grid grid-cols-4 gap-3 mt-3">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-700">{ingestResult.success}</p>
                  <p className="text-xs text-green-600">Parsed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{ingestResult.errors}</p>
                  <p className="text-xs text-red-500">Errors</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-600">{ingestResult.needs_review}</p>
                  <p className="text-xs text-amber-500">Need Review</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-700">${ingestResult.total_cost.toFixed(3)}</p>
                  <p className="text-xs text-gray-500">Cost ({ingestResult.model_used})</p>
                </div>
              </div>
            </div>
          )}

          {/* Ingest file list */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-xs w-10">#</TableHead>
                  <TableHead className="text-xs">File Name</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs">Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fileStatuses.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-xs font-medium">{f.name}</TableCell>
                    <TableCell className="text-center">{statusBadge(f.status)}</TableCell>
                    <TableCell className="text-xs text-red-600 max-w-[300px] truncate">{f.error || ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {ingestResult && !showMapping && (
            <div className="flex gap-3 justify-center">
              <Button onClick={enterMappingStep} className="gap-2">
                <Building2 className="h-4 w-4" />
                Map to Accounts
              </Button>
              <Button variant="outline" onClick={() => router.push('/financials')}>
                Skip — Go to Financials
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 5: Post-import account mapping */}
      {showMapping && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Map Statements to Accounts</h3>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => { setShowNewAccountInline(true) }}>
              <Plus className="h-3.5 w-3.5" />
              New Account
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Assign each imported statement to the correct bank account. If the account doesn&apos;t exist, create one first.
          </p>

          {loadingMapping && <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>}

          {/* Inline new account form */}
          {showNewAccountInline && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-blue-800">Create New Account</h4>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Bank *</label>
                  <Input
                    value={newAcctForm.bankName}
                    onChange={(e) => setNewAcctForm({ ...newAcctForm, bankName: e.target.value })}
                    placeholder="CommBank"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Account Name</label>
                  <Input
                    value={newAcctForm.accountName}
                    onChange={(e) => setNewAcctForm({ ...newAcctForm, accountName: e.target.value })}
                    placeholder="Maged W. H. BOCTOR"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">BSB</label>
                  <Input
                    value={newAcctForm.bsb}
                    onChange={(e) => setNewAcctForm({ ...newAcctForm, bsb: e.target.value })}
                    placeholder="062-190"
                    className="mt-1 h-8 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Account Number</label>
                  <Input
                    value={newAcctForm.accountNumber}
                    onChange={(e) => setNewAcctForm({ ...newAcctForm, accountNumber: e.target.value })}
                    placeholder="10001521"
                    className="mt-1 h-8 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Type</label>
                  <Select value={newAcctForm.accountType} onValueChange={(v) => v && setNewAcctForm({ ...newAcctForm, accountType: v })}>
                    <SelectTrigger className="h-8 mt-1 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal_cheque">Personal Transaction</SelectItem>
                      <SelectItem value="personal_savings">Personal Savings</SelectItem>
                      <SelectItem value="business_cheque">Business Transaction</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Entity</label>
                  <Select value={newAcctForm.entityId || 'none'} onValueChange={(v) => v && setNewAcctForm({ ...newAcctForm, entityId: v === 'none' ? '' : v })}>
                    <SelectTrigger className="h-8 mt-1 text-xs">
                      <SelectValue>
                        {newAcctForm.entityId ? mappingEntities.find((e: any) => e.id === newAcctForm.entityId)?.name || 'Unknown' : 'Unassigned'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {mappingEntities.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={createAccountInline} disabled={!newAcctForm.bankName.trim()}>Create Account</Button>
                <Button size="sm" variant="outline" onClick={() => setShowNewAccountInline(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Statements mapping table */}
          {!loadingMapping && mappingStatements.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs">File</TableHead>
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">Bank (detected)</TableHead>
                    <TableHead className="text-xs">Period</TableHead>
                    <TableHead className="text-xs text-center">Txns</TableHead>
                    <TableHead className="text-xs">Mapped Account</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappingStatements.map((stmt: any) => (
                    <TableRow key={stmt.id} className={!stmt.accountId ? 'bg-amber-50/40' : ''}>
                      <TableCell className="text-xs font-medium max-w-[200px] truncate">{stmt.fileName || '—'}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${
                          stmt.sourceType === 'csv' ? 'bg-blue-100 text-blue-700' :
                          stmt.sourceType === 'pdf_ocr' ? 'bg-amber-100 text-amber-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {(stmt.sourceType || 'pdf').toUpperCase().replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{stmt.bankName || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {stmt.statementStart && stmt.statementEnd
                          ? `${stmt.statementStart} → ${stmt.statementEnd}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-center">{stmt.transactionCount || 0}</TableCell>
                      <TableCell>
                        <Select
                          value={stmt.accountId || 'none'}
                          onValueChange={(v) => v && reassignStatement(stmt.id, v === 'none' ? null : v)}
                        >
                          <SelectTrigger className={`h-7 w-56 text-xs ${!stmt.accountId ? 'border-amber-300 bg-amber-50' : ''}`}>
                            <SelectValue>
                              {stmt.accountId
                                ? (() => {
                                    const acct = mappingAccounts.find((a: any) => a.id === stmt.accountId)
                                    return acct ? `${acct.bankName} ${acct.accountNumber || acct.accountName || ''}`.trim() : 'Unknown'
                                  })()
                                : '⚠ Select account...'}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {mappingAccounts.map((a: any) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.bankName} {a.accountNumber || ''} {a.accountName ? `(${a.accountName})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex gap-3 justify-center pt-2">
            <Button onClick={() => router.push('/financials')} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Done — Go to Financials
            </Button>
            <Button variant="outline" onClick={() => { setShowMapping(false); setIngestResult(null); setFileStatuses([]); handleScan() }}>
              Import More
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
