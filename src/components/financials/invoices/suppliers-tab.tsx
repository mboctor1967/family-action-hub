'use client'

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Loader2, Play, Edit2, Trash2, X, Save, CheckCircle2 } from 'lucide-react'
import type { InvoiceSupplierConfig, ScanProgressEvent } from '@/types/financials'

interface Entity { id: string; name: string; type: string }

export function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<InvoiceSupplierConfig[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [scanning, setScanning] = useState<string | null>(null) // supplierId being scanned
  const [scanStep, setScanStep] = useState('')
  const [scanPct, setScanPct] = useState(0)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [supRes, entRes] = await Promise.all([
      fetch('/api/financials/invoices/suppliers'),
      fetch('/api/financials/entities'),
    ])
    if (supRes.ok) setSuppliers(await supRes.json())
    if (entRes.ok) {
      const data = await entRes.json()
      setEntities(Array.isArray(data) ? data : data.entities ?? [])
    }
    setLoading(false)
  }

  async function deleteSupplier(id: string, name: string) {
    if (!confirm(`Delete supplier "${name}" and all its extracted invoices?`)) return
    const res = await fetch(`/api/financials/invoices/suppliers/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); loadData() }
    else toast.error('Failed')
  }

  async function startScan(supplierId: string) {
    setScanning(supplierId)
    setScanStep('Starting…')
    setScanPct(0)

    try {
      const res = await fetch('/api/financials/invoices/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId }),
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
            if (event.type === 'progress') {
              setScanStep(event.step ?? '')
              setScanPct(event.percent ?? 0)
            } else if (event.type === 'complete') {
              toast.success(event.message ?? `Scan complete: ${event.invoicesExtracted ?? 0} invoices`)
              setScanning(null)
              loadData()
            } else if (event.type === 'error') {
              toast.error(event.message ?? 'Scan failed')
              setScanning(null)
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Scan failed')
    }
    setScanning(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
  }

  return (
    <div className="space-y-4">
      {/* Scan progress bar */}
      {scanning && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-blue-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{scanStep || 'Starting…'}</span>
            </div>
            <span className="text-blue-600 font-medium">{scanPct}%</span>
          </div>
          <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${scanPct}%` }} />
          </div>
        </div>
      )}

      {/* Supplier list */}
      {suppliers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No suppliers configured yet.</p>
          <p className="text-xs mt-1">Add a supplier to start scanning Gmail for invoices.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map(s => editingId === s.id ? (
            <EditSupplierForm
              key={s.id}
              supplier={s}
              entities={entities}
              onSave={() => { setEditingId(null); loadData() }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={s.id} className="bg-white rounded-2xl border border-border p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{s.name}</h3>
                  {s.entityName && (
                    <span className="text-[10px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                      {s.entityName}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{s.fy}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {(s.senderEmails as string[])?.length > 0 && (
                    <span>From: <span className="font-medium text-gray-700">{(s.senderEmails as string[]).join(', ')}</span></span>
                  )}
                  {s.gmailLabel && !((s.senderEmails as string[])?.length > 0) && (
                    <span>Label: <span className="font-medium text-gray-700">{s.gmailLabel}</span></span>
                  )}
                  {s.defaultAtoCode && <span>ATO: <span className="font-medium text-gray-700">{s.defaultAtoCode}</span></span>}
                  {s.lastScannedAt && <span>Last scan: {new Date(s.lastScannedAt).toLocaleDateString('en-AU')}</span>}
                  <span>Keywords: {(s.keywords as string[])?.length ?? 0}</span>
                </div>
              </div>
              <button
                onClick={() => setEditingId(s.id)}
                className="text-muted-foreground hover:text-blue-600"
                title="Edit"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => startScan(s.id)}
                disabled={!!scanning}
                className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-md"
              >
                <Play className="h-3.5 w-3.5" /> Scan
              </button>
              <button
                onClick={() => deleteSupplier(s.id, s.name)}
                className="text-muted-foreground hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add supplier form */}
      {showAdd ? (
        <AddSupplierForm
          entities={entities}
          onSave={() => { setShowAdd(false); loadData() }}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-3 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-dashed border-blue-300 flex items-center justify-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> Add Supplier
        </button>
      )}
    </div>
  )
}

function AddSupplierForm({
  entities,
  onSave,
  onCancel,
}: {
  entities: Entity[]
  onSave: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [entityId, setEntityId] = useState('')
  const [senderEmails, setSenderEmails] = useState('')
  const [gmailLabel, setGmailLabel] = useState('')
  const [keywords, setKeywords] = useState('')
  const [fy, setFy] = useState(getCurrentFy())
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [defaultAtoCode, setDefaultAtoCode] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    if (!senderEmails.trim() && !gmailLabel.trim()) {
      toast.error('Provide either sender email addresses or a Gmail label')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/financials/invoices/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          entityId: entityId || null,
          senderEmails: senderEmails.split(',').map(e => e.trim()).filter(Boolean),
          gmailLabel: gmailLabel.trim() || null,
          keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
          fy,
          customStartDate: customStartDate || null,
          customEndDate: customEndDate || null,
          defaultAtoCode: defaultAtoCode || null,
        }),
      })
      if (res.ok) { toast.success('Supplier added'); onSave() }
      else toast.error((await res.json()).error || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">New Supplier</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Supplier Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Wilson Parking"
            className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Entity</label>
          <select value={entityId} onChange={e => setEntityId(e.target.value)}
            className="mt-1 w-full h-9 px-2 text-sm border border-border rounded-md bg-white">
            <option value="">Select…</option>
            {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Sender Email Addresses * (comma separated)</label>
          <input value={senderEmails} onChange={e => setSenderEmails(e.target.value)}
            placeholder="e.g. noreply@wilsonparking.com.au, billing@wilsonparking.com.au"
            className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md" />
          <p className="text-[10px] text-muted-foreground mt-0.5">The email address(es) this supplier sends invoices from. Check your inbox for their sender address.</p>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Keywords (comma separated) — matches subject + body</label>
          <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="invoice, receipt, payment, tax invoice"
            className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Financial Year</label>
          <input value={fy} onChange={e => setFy(e.target.value)} placeholder="FY2024-25"
            className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Default ATO Code</label>
          <input value={defaultAtoCode} onChange={e => setDefaultAtoCode(e.target.value)} placeholder="e.g. 6-MV, 6-OTHER-SUBS"
            className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Custom Start Date (optional — overrides FY)</label>
          <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)}
            className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Custom End Date (optional — overrides FY)</label>
          <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)}
            className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Gmail Label (legacy — only needed if sender emails aren't available)</label>
          <input value={gmailLabel} onChange={e => setGmailLabel(e.target.value)} placeholder="e.g. Wilson 2024-25 (leave empty to use sender-based search)"
            className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md text-muted-foreground" />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md">Cancel</button>
        <button onClick={save} disabled={!name.trim() || saving}
          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md">
          {saving ? 'Saving…' : 'Add Supplier'}
        </button>
      </div>
    </div>
  )
}

function EditSupplierForm({
  supplier,
  entities,
  onSave,
  onCancel,
}: {
  supplier: InvoiceSupplierConfig
  entities: Entity[]
  onSave: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(supplier.name)
  const [entityId, setEntityId] = useState(supplier.entityId ?? '')
  const [senderEmails, setSenderEmails] = useState((supplier.senderEmails ?? []).join(', '))
  const [gmailLabel, setGmailLabel] = useState(supplier.gmailLabel ?? '')
  const [keywords, setKeywords] = useState((supplier.keywords ?? []).join(', '))
  const [fy, setFy] = useState(supplier.fy)
  const [customStartDate, setCustomStartDate] = useState(supplier.customStartDate ?? '')
  const [customEndDate, setCustomEndDate] = useState(supplier.customEndDate ?? '')
  const [defaultAtoCode, setDefaultAtoCode] = useState(supplier.defaultAtoCode ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/financials/invoices/suppliers/${supplier.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          entityId: entityId || null,
          senderEmails: senderEmails.split(',').map(e => e.trim()).filter(Boolean),
          gmailLabel: gmailLabel.trim() || null,
          keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
          fy,
          customStartDate: customStartDate || null,
          customEndDate: customEndDate || null,
          defaultAtoCode: defaultAtoCode || null,
        }),
      })
      if (res.ok) { toast.success('Supplier updated'); onSave() }
      else toast.error((await res.json()).error || 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-blue-50 rounded-2xl border border-blue-200 p-5 space-y-3">
      <h3 className="text-sm font-semibold text-blue-900">Edit: {supplier.name}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Supplier Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md bg-white" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Entity</label>
          <select value={entityId} onChange={e => setEntityId(e.target.value)} className="mt-1 w-full h-9 px-2 text-sm border border-border rounded-md bg-white">
            <option value="">Select…</option>
            {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Sender Email Addresses (comma separated)</label>
          <input value={senderEmails} onChange={e => setSenderEmails(e.target.value)}
            placeholder="e.g. noreply@wilsonparking.com.au"
            className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md bg-white" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Keywords (comma separated)</label>
          <input value={keywords} onChange={e => setKeywords(e.target.value)} className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md bg-white" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">FY</label>
          <input value={fy} onChange={e => setFy(e.target.value)} className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md bg-white" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Default ATO Code</label>
          <input value={defaultAtoCode} onChange={e => setDefaultAtoCode(e.target.value)} className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md bg-white" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Custom Start (optional)</label>
          <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md bg-white" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Custom End (optional)</label>
          <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md bg-white" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Gmail Label (legacy fallback)</label>
          <input value={gmailLabel} onChange={e => setGmailLabel(e.target.value)} className="mt-1 w-full h-9 px-3 text-sm border border-border rounded-md bg-white text-muted-foreground" />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-700 hover:bg-white rounded-md">Cancel</button>
        <button onClick={save} disabled={saving} className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

function getCurrentFy() {
  const now = new Date()
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  return `FY${startYear}-${String(startYear + 1).slice(-2)}`
}
