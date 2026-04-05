'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  Loader2,
  Search,
  Info,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Txn {
  id: string
  date: string
  amount: string
  description: string | null
  merchantName: string | null
  accountId: string
  accountName: string | null
  accountNumberLast4: string | null
  bankName: string
  entityId: string | null
}

interface Proposal {
  debit: Txn
  credit: Txn
  sameEntity: boolean
  confidence: 'high' | 'medium' | 'low'
}

const formatAUD = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v)

export function TransferDetectView() {
  const router = useRouter()
  const [scanning, setScanning] = useState(false)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [scanned, setScanned] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')

  async function handleScan() {
    setScanning(true)
    setScanned(false)
    setSelected(new Set())
    try {
      const res = await fetch('/api/financials/transfers')
      if (res.ok) {
        const data = await res.json()
        setProposals(data.proposals || [])
        setScanned(true)
        // Auto-select all high-confidence matches
        const highConfidence = new Set<number>()
        data.proposals?.forEach((p: Proposal, i: number) => {
          if (p.confidence === 'high') highConfidence.add(i)
        })
        setSelected(highConfidence)
        toast.success(`Found ${data.total} potential transfer pairs (${data.high} high, ${data.medium} medium, ${data.low} low confidence)`)
      } else {
        toast.error('Scan failed')
      }
    } catch {
      toast.error('Scan failed')
    }
    setScanning(false)
  }

  async function handleConfirm() {
    if (selected.size === 0) return
    setConfirming(true)
    try {
      const pairs = Array.from(selected).map((i) => ({
        debitId: proposals[i].debit.id,
        creditId: proposals[i].credit.id,
      }))
      const res = await fetch('/api/financials/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Confirmed ${data.confirmed} transfer pairs`)
        // Re-scan to remove confirmed ones from the list
        handleScan()
      } else {
        toast.error('Failed to confirm')
      }
    } catch {
      toast.error('Failed')
    }
    setConfirming(false)
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filtered.map((_, i) => visibleIndexes[i])))
  }

  function selectNone() {
    setSelected(new Set())
  }

  const filtered = confidenceFilter === 'all'
    ? proposals
    : proposals.filter((p) => p.confidence === confidenceFilter)

  // Map filtered-index → original proposals-index
  const visibleIndexes: number[] = []
  proposals.forEach((p, i) => {
    if (confidenceFilter === 'all' || p.confidence === confidenceFilter) visibleIndexes.push(i)
  })

  const confidenceBadge = (c: string) => {
    if (c === 'high') return <Badge className="bg-green-100 text-green-700 text-[10px]">High</Badge>
    if (c === 'medium') return <Badge className="bg-amber-100 text-amber-700 text-[10px]">Medium</Badge>
    return <Badge className="bg-red-100 text-red-600 text-[10px]">Low</Badge>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold">Detect Transfers</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Find matching debit/credit pairs between your accounts. Confirmed transfers are excluded from spending and tax reports.
            </p>
          </div>
        </div>
        <Button onClick={handleScan} disabled={scanning} className="gap-1.5">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {scanning ? 'Scanning...' : 'Detect Transfers'}
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">How it works</p>
          <p className="mt-1 text-blue-700">
            The scanner finds pairs where a debit on one account matches a credit on another (same amount, date within ±1 day, different accounts).
            High-confidence matches (same entity + exact date) are auto-selected. Review and click &quot;Confirm&quot; to mark them as transfers.
          </p>
        </div>
      </div>

      {scanned && proposals.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100 shadow-sm">
          <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 mb-2" />
          <p className="text-sm font-medium">No unmatched transfers found</p>
          <p className="text-xs text-muted-foreground mt-1">All potential transfers have been classified.</p>
        </div>
      )}

      {proposals.length > 0 && (
        <>
          {/* Stats + filter */}
          <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <span className="text-xs font-medium text-muted-foreground">Confidence:</span>
            {(['all', 'high', 'medium', 'low'] as const).map((c) => (
              <button
                key={c}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                  confidenceFilter === c ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-muted/50 border border-gray-200'
                }`}
                onClick={() => setConfidenceFilter(c)}
              >
                {c === 'all' ? `All (${proposals.length})` : `${c[0].toUpperCase() + c.slice(1)} (${proposals.filter((p) => p.confidence === c).length})`}
              </button>
            ))}
            <div className="flex gap-1.5 ml-auto">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={selectAll}>Select All</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={selectNone}>Deselect</Button>
            </div>
          </div>

          {/* Proposals table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="text-xs text-center">Confidence</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs">From (Debit)</TableHead>
                  <TableHead className="text-xs">To (Credit)</TableHead>
                  <TableHead className="text-xs text-center">Same Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p, fIdx) => {
                  const origIdx = visibleIndexes[fIdx]
                  const isChecked = selected.has(origIdx)
                  return (
                    <TableRow
                      key={`${p.debit.id}-${p.credit.id}`}
                      className={`cursor-pointer ${isChecked ? 'bg-blue-50/40' : 'hover:bg-muted/30'}`}
                      onClick={() => toggle(origIdx)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isChecked} onCheckedChange={() => toggle(origIdx)} />
                      </TableCell>
                      <TableCell className="text-center">{confidenceBadge(p.confidence)}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{formatAUD(Math.abs(Number(p.debit.amount)))}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{p.debit.bankName} ••{p.debit.accountNumberLast4 || '??'}</div>
                        <div className="text-muted-foreground text-[10px]">{p.debit.date}</div>
                        <div className="text-muted-foreground text-[10px] truncate max-w-[280px]">{p.debit.description}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{p.credit.bankName} ••{p.credit.accountNumberLast4 || '??'}</div>
                        <div className="text-muted-foreground text-[10px]">{p.credit.date}</div>
                        <div className="text-muted-foreground text-[10px] truncate max-w-[280px]">{p.credit.description}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        {p.sameEntity ? (
                          <Badge className="bg-green-100 text-green-700 text-[10px]">✓</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 text-[10px]">Cross</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Sticky confirm bar */}
          {selected.size > 0 && (
            <div className="sticky bottom-0 bg-white border-t border-gray-200 rounded-xl shadow-lg p-4 flex items-center justify-between">
              <span className="text-sm">
                <span className="font-semibold">{selected.size}</span> pair{selected.size > 1 ? 's' : ''} selected — will mark as confirmed transfers
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelected(new Set())}>Cancel</Button>
                <Button onClick={handleConfirm} disabled={confirming} className="gap-1.5">
                  {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
                  Confirm {selected.size} Pair{selected.size > 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {!scanned && proposals.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100 shadow-sm">
          <ArrowLeftRight className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Click &quot;Detect Transfers&quot; to scan for potential transfer pairs.</p>
        </div>
      )}
    </div>
  )
}
