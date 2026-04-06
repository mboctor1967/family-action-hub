'use client'

import { useEffect, useState } from 'react'
import { Loader2, FileText, ExternalLink, Link2, AlertCircle } from 'lucide-react'
import type { InvoiceRecord } from '@/types/financials'

const formatAUD = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(v)

export function InvoicesListTab() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fy, setFy] = useState(getCurrentFy())

  useEffect(() => {
    setLoading(true)
    fetch(`/api/financials/invoices?fy=${fy}&limit=200`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => { setInvoices(d.invoices || []); setTotal(d.total || 0) })
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false))
  }, [fy])

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
      </div>

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
