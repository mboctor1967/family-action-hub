'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, FileText, ExternalLink, Link2, AlertCircle, Play, Download, ChevronDown, ChevronRight, Table2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { InvoiceRecord, ScanProgressEvent } from '@/types/financials'

const formatAUD = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(v)

export function InvoicesListTab() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fy, setFy] = useState(getCurrentFy())
  const [scanning, setScanning] = useState(false)
  const [scanStep, setScanStep] = useState('')
  const [scanPct, setScanPct] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  function loadInvoices() {
    setLoading(true)
    fetch(`/api/financials/invoices?fy=${fy}&limit=200`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => { setInvoices(d.invoices || []); setTotal(d.total || 0) })
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadInvoices() }, [fy])

  async function scanAll() {
    setScanning(true)
    setScanStep('Starting…')
    setScanPct(0)

    try {
      const res = await fetch('/api/financials/invoices/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fy,
          ...(customStart ? { startDate: customStart } : {}),
          ...(customEnd ? { endDate: customEnd } : {}),
        }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Scan failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event: ScanProgressEvent = JSON.parse(line.slice(6))
            if (event.type === 'progress') { setScanStep(event.step ?? ''); setScanPct(event.percent ?? 0) }
            else if (event.type === 'complete') { toast.success(event.message ?? 'Scan complete'); setScanning(false); loadInvoices() }
            else if (event.type === 'error') { toast.error(event.message ?? 'Scan failed'); setScanning(false) }
          } catch {}
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Scan failed')
    }
    setScanning(false)
  }

  function getExportRows() {
    return invoices.map(inv => ({
      'Date': inv.invoiceDate ?? (inv.sourceEmailDate as any)?.toString?.().slice(0, 10) ?? '',
      'Supplier': inv.supplierName ?? '',
      'Invoice #': inv.invoiceNumber ?? '',
      'Reference #': inv.referenceNumber ?? '',
      'Type': inv.emailType ?? '',
      'Description': inv.description ?? '',
      'Location': inv.location ?? '',
      'Service Type': inv.serviceType ?? '',
      'Sub-Total': inv.subTotal != null ? Number(inv.subTotal) : '',
      'GST': inv.gstAmount != null ? Number(inv.gstAmount) : '',
      'Total': inv.totalAmount != null ? Number(inv.totalAmount) : '',
      'ATO Code': inv.atoCode ?? '',
      'Status': inv.status ?? '',
      'PDF URL': inv.pdfBlobUrl ?? '',
    }))
  }

  function exportCsv() {
    if (invoices.length === 0) return
    const rows = getExportRows()
    const csv = Papa.unparse(rows, { header: true })
    const bom = '\uFEFF'
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoices_${fy}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} invoices as CSV`)
  }

  function exportExcel() {
    if (invoices.length === 0) return
    const rows = getExportRows()
    const ws = XLSX.utils.json_to_sheet(rows)

    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String((r as any)[key] ?? '').length).slice(0, 50)) + 2,
    }))
    ws['!cols'] = colWidths

    // Format currency columns
    const currCols = ['Sub-Total', 'GST', 'Total']
    const headers = Object.keys(rows[0] || {})
    for (let r = 1; r <= rows.length; r++) {
      for (const col of currCols) {
        const colIdx = headers.indexOf(col)
        if (colIdx < 0) continue
        const cellRef = XLSX.utils.encode_cell({ r, c: colIdx })
        const cell = ws[cellRef]
        if (cell && typeof cell.v === 'number') {
          cell.z = '$#,##0.00'
        }
      }
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
    XLSX.writeFile(wb, `invoices_${fy}.xlsx`)
    toast.success(`Exported ${rows.length} invoices as Excel`)
  }

  async function downloadAllPdfs() {
    const withPdfs = invoices.filter(i => i.pdfBlobUrl)
    if (withPdfs.length === 0) { toast.error('No PDFs to download'); return }
    setDownloading(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      let count = 0
      for (const inv of withPdfs) {
        try {
          const res = await fetch(inv.pdfBlobUrl!)
          if (!res.ok) continue
          const buf = await res.arrayBuffer()
          const name = `${inv.invoiceDate ?? 'unknown'}_${(inv.supplierName ?? 'invoice').replace(/[^a-zA-Z0-9]/g, '_')}_${inv.invoiceNumber ?? inv.id.slice(0, 8)}.pdf`
          zip.file(name, buf)
          count++
        } catch {}
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoices_pdfs_${fy}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Downloaded ${count} PDFs as ZIP`)
    } catch (err: any) {
      toast.error('ZIP download failed')
    }
    setDownloading(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading invoices…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">FY</label>
        <select value={fy} onChange={e => setFy(e.target.value)}
          className="text-sm border border-border rounded-md px-2 py-1 bg-white">
          {buildFyOptions().map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{total} invoice{total !== 1 ? 's' : ''}</span>
        <span className="text-muted-foreground">|</span>
        <label className="text-xs text-muted-foreground">From</label>
        <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
          placeholder="Start" className="text-xs border border-border rounded-md px-2 py-1 w-32" />
        <label className="text-xs text-muted-foreground">To</label>
        <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
          placeholder="End" className="text-xs border border-border rounded-md px-2 py-1 w-32" />
        {(customStart || customEnd) && (
          <button onClick={() => { setCustomStart(''); setCustomEnd('') }}
            className="text-[10px] text-red-600 hover:underline">clear</button>
        )}
        <div className="flex-1" />
        {invoices.length > 0 && (
          <>
            <button onClick={exportExcel} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-blue-700 border border-border rounded-md px-3 py-1.5">
              <Table2 className="h-3.5 w-3.5" /> Excel
            </button>
            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-blue-700 border border-border rounded-md px-3 py-1.5">
              <Table2 className="h-3.5 w-3.5" /> CSV
            </button>
            <button onClick={downloadAllPdfs} disabled={downloading}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-blue-700 border border-border rounded-md px-3 py-1.5 disabled:opacity-50">
              <Download className="h-3.5 w-3.5" /> {downloading ? 'Zipping…' : 'Download All PDFs'}
            </button>
          </>
        )}
        <button
          onClick={scanAll}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md"
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {scanning ? 'Scanning…' : `Scan All for ${fy}`}
        </button>
      </div>

      {scanning && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-blue-700">{scanStep}</span>
            <span className="text-blue-600 font-medium">{scanPct}%</span>
          </div>
          <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${scanPct}%` }} />
          </div>
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No invoices found for {fy}. Run a scan from the Suppliers tab first.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Supplier</th>
                  <th className="text-left px-4 py-2">Invoice #</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-right px-4 py-2">Amount</th>
                  <th className="text-right px-4 py-2">GST</th>
                  <th className="text-left px-4 py-2">ATO</th>
                  <th className="text-center px-4 py-2">Status</th>
                  <th className="text-center px-4 py-2">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map(inv => {
                  const isExpanded = expandedId === inv.id
                  return (
                    <>{/* eslint-disable-next-line react/jsx-key */}
                    <tr key={inv.id} className={`cursor-pointer ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-gray-50/50'}`}
                      onClick={() => setExpandedId(isExpanded ? null : inv.id)}>
                      <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {inv.invoiceDate || (inv.sourceEmailDate as any)?.toString?.().slice(0, 10) || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs font-medium text-gray-900 max-w-[200px] truncate">
                        {inv.supplierName ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-700">{inv.invoiceNumber ?? '—'}</td>
                      <td className="px-4 py-2"><TypeBadge type={inv.emailType} /></td>
                      <td className="px-4 py-2 text-xs text-right font-medium text-gray-900">
                        {inv.totalAmount != null ? formatAUD(Number(inv.totalAmount)) : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-right text-muted-foreground">
                        {inv.gstAmount != null ? formatAUD(Number(inv.gstAmount)) : '—'}
                      </td>
                      <td className="px-4 py-2 text-[10px] font-medium text-gray-700">{inv.atoCode ?? '—'}</td>
                      <td className="px-4 py-2 text-center"><StatusBadge status={inv.status} linked={!!inv.linkedTxnId} /></td>
                      <td className="px-4 py-2 text-center" onClick={e => e.stopPropagation()}>
                        {inv.pdfBlobUrl ? (
                          <a href={inv.pdfBlobUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">
                            <FileText className="h-4 w-4 inline" />
                          </a>
                        ) : <span className="text-muted-foreground text-[10px]">—</span>}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${inv.id}-detail`}>
                        <td colSpan={9} className="p-0 bg-gray-50/70">
                          <InvoiceDetail inv={inv} />
                        </td>
                      </tr>
                    )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
          {total > invoices.length && (
            <div className="px-4 py-2 text-xs text-muted-foreground text-center border-t border-border">
              Showing {invoices.length} of {total}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TypeBadge({ type }: { type: string | null }) {
  const cfg: Record<string, string> = {
    Invoice: 'bg-blue-100 text-blue-700',
    Receipt: 'bg-green-100 text-green-700',
    'Payment Confirmation': 'bg-amber-100 text-amber-700',
  }
  const cls = cfg[type ?? ''] ?? 'bg-gray-100 text-gray-600'
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${cls}`}>{type ?? '—'}</span>
}

function StatusBadge({ status, linked }: { status: string; linked: boolean }) {
  if (linked) return <span title="Linked to transaction"><Link2 className="h-3.5 w-3.5 text-green-600 inline" /></span>
  const cfg: Record<string, string> = {
    extracted: 'bg-gray-100 text-gray-600',
    verified: 'bg-blue-100 text-blue-700',
    linked: 'bg-green-100 text-green-700',
    excluded: 'bg-red-100 text-red-600',
  }
  const cls = cfg[status] ?? cfg.extracted
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${cls}`}>{status}</span>
}

function InvoiceDetail({ inv }: { inv: InvoiceRecord }) {
  return (
    <div className="px-6 py-4 grid grid-cols-[1fr_1fr] gap-x-8 gap-y-1">
      {/* Left: invoice fields */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">Invoice details</h4>
        <Field label="Supplier" value={inv.supplierName} />
        <Field label="Invoice #" value={inv.invoiceNumber} />
        <Field label="Reference #" value={inv.referenceNumber} />
        <Field label="Invoice date" value={inv.invoiceDate} />
        <Field label="Purchase date" value={inv.purchaseDate} />
        <Field label="Service date" value={inv.serviceDate} />
        <Field label="Location" value={inv.location} />
        <Field label="Service type" value={inv.serviceType} />
        <Field label="Type" value={inv.emailType} />
        <Field label="Description" value={inv.description} />
        <div className="border-t border-gray-200 pt-2 mt-2" />
        <Field label="Sub-total" value={inv.subTotal != null ? formatAUD(Number(inv.subTotal)) : null} />
        <Field label="GST" value={inv.gstAmount != null ? formatAUD(Number(inv.gstAmount)) : null} />
        <Field label="Total" value={inv.totalAmount != null ? formatAUD(Number(inv.totalAmount)) : null} bold />
        <div className="border-t border-gray-200 pt-2 mt-2" />
        <Field label="ATO code" value={inv.atoCode} />
        <Field label="Status" value={inv.status} />
        <Field label="Email from" value={inv.sourceFrom} />
        <Field label="Email date" value={inv.sourceEmailDate?.toString().slice(0, 10)} />
      </div>
      {/* Right: PDF preview */}
      <div>
        <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">PDF preview</h4>
        {inv.pdfBlobUrl ? (
          <div className="border border-border rounded-lg overflow-hidden bg-white" style={{ height: 500 }}>
            <iframe src={inv.pdfBlobUrl} className="w-full h-full" title="Invoice PDF" />
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg text-sm text-muted-foreground">
            No PDF available for this invoice
          </div>
        )}
        {inv.pdfBlobUrl && (
          <a href={inv.pdfBlobUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 mt-2">
            <ExternalLink className="h-3 w-3" /> Open PDF in new tab
          </a>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, bold = false }: { label: string; value: string | null | undefined; bold?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className={`text-gray-900 ${bold ? 'font-semibold text-sm' : ''}`}>{value || '—'}</span>
    </div>
  )
}

function getCurrentFy() {
  const now = new Date()
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  return `FY${startYear}-${String(startYear + 1).slice(-2)}`
}

function buildFyOptions(): string[] {
  const now = new Date()
  const currentStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  return Array.from({ length: 5 }, (_, i) => {
    const s = currentStart - 2 + i
    return `FY${s}-${String(s + 1).slice(-2)}`
  })
}
