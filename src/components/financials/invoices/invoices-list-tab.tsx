'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, FileText, ExternalLink, Link2, AlertCircle, Play } from 'lucide-react'
import toast from 'react-hot-toast'
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
        body: JSON.stringify({ fy }),
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
        <div className="flex-1" />
        <button
          onClick={scanAll}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md"
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {scanning ? 'Scanning…' : `Scan All Suppliers for ${fy}`}
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
                {invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2 text-xs text-gray-700 whitespace-nowrap">
                      {inv.invoiceDate || inv.sourceEmailDate?.slice(0, 10) || '—'}
                    </td>
                    <td className="px-4 py-2 text-xs font-medium text-gray-900 max-w-[200px] truncate">
                      {inv.supplierName ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700">{inv.invoiceNumber ?? '—'}</td>
                    <td className="px-4 py-2">
                      <TypeBadge type={inv.emailType} />
                    </td>
                    <td className="px-4 py-2 text-xs text-right font-medium text-gray-900">
                      {inv.totalAmount != null ? formatAUD(Number(inv.totalAmount)) : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-right text-muted-foreground">
                      {inv.gstAmount != null ? formatAUD(Number(inv.gstAmount)) : '—'}
                    </td>
                    <td className="px-4 py-2 text-[10px] font-medium text-gray-700">
                      {inv.atoCode ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <StatusBadge status={inv.status} linked={!!inv.linkedTxnId} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      {inv.pdfBlobUrl ? (
                        <a href={inv.pdfBlobUrl} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700">
                          <FileText className="h-4 w-4 inline" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
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
