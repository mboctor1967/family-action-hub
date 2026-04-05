'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Tag, Check, Filter } from 'lucide-react'

interface Entity { id: string; name: string; type: string; color: string }
interface Account { id: string; bankName: string; accountName: string | null; accountNumber: string | null; accountNumberLast4: string | null; entityId: string | null }
interface Counts { total: number; income: number; expenses: number; total_income: number; total_spend: number; uncategorized: number; unique_merchants: number }
interface PeriodOption { value: string; label: string; from: string; to: string }

export interface FilterState { entityIds: string[]; accountIds: string[]; from?: string; to?: string }

interface Props {
  onFilterChange: (filters: FilterState) => void
  showDateFilter?: boolean
}

const formatAUD = (v: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v)

function buildPeriodOptions(): PeriodOption[] {
  const now = new Date()
  const currentFY = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  const options: PeriodOption[] = []
  for (let y = currentFY; y >= 2023; y--) options.push({ value: `fy${y}`, label: `FY${y}/${y + 1}`, from: `${y}-07-01`, to: `${y + 1}-06-30` })
  for (let y = now.getFullYear(); y >= 2024; y--) options.push({ value: `cy${y}`, label: `CY ${y}`, from: `${y}-01-01`, to: `${y}-12-31` })
  return options
}

function Chip({ label, selected, color, onClick }: { label: string; selected: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-all select-none ${
        selected
          ? 'border-blue-500 bg-blue-600 text-white font-semibold shadow-sm'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {color && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selected ? 'white' : color }} />}
      {selected && <Check className="h-2.5 w-2.5 shrink-0" />}
      {label}
    </button>
  )
}

export function AccountFilter({ onFilterChange, showDateFilter = true }: Props) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const periodOptions = buildPeriodOptions()

  // Draft selections (not applied yet)
  const [draftEnts, setDraftEnts] = useState<string[]>([])
  const [draftAccts, setDraftAccts] = useState<string[]>([])
  const [draftPeriods, setDraftPeriods] = useState<string[]>([])

  // Applied selections (what's actually filtering)
  const [appliedEnts, setAppliedEnts] = useState<string[]>([])
  const [appliedAccts, setAppliedAccts] = useState<string[]>([])
  const [appliedPeriods, setAppliedPeriods] = useState<string[]>([])

  const isDirty = JSON.stringify({ e: draftEnts, a: draftAccts, p: draftPeriods }) !==
                  JSON.stringify({ e: appliedEnts, a: appliedAccts, p: appliedPeriods })

  useEffect(() => {
    Promise.all([
      fetch('/api/financials/entities').then(r => r.ok ? r.json() : []),
      fetch('/api/financials/accounts').then(r => r.ok ? r.json() : []),
    ]).then(([e, a]) => { setEntities(e); setAccounts(a) }).catch(() => {})
    fetch('/api/financials/counts').then(r => r.ok ? r.json() : null).then(setCounts).catch(() => {})
  }, [])

  function computeDateRange(pIds: string[]): { from?: string; to?: string } {
    if (!pIds.length) return {}
    const sel = periodOptions.filter(o => pIds.includes(o.value))
    return { from: sel.map(o => o.from).sort()[0], to: sel.map(o => o.to).sort().reverse()[0] }
  }

  function applyFilters() {
    setAppliedEnts([...draftEnts])
    setAppliedAccts([...draftAccts])
    setAppliedPeriods([...draftPeriods])

    const dates = computeDateRange(draftPeriods)
    const filter: FilterState = { entityIds: draftEnts, accountIds: draftAccts, ...dates }
    onFilterChange(filter)

    // Fetch counts
    const params = new URLSearchParams()
    if (draftEnts.length) params.set('entity_ids', draftEnts.join(','))
    if (draftAccts.length) params.set('account_ids', draftAccts.join(','))
    if (dates.from) params.set('from', dates.from)
    if (dates.to) params.set('to', dates.to)
    fetch(`/api/financials/counts?${params}`).then(r => r.ok ? r.json() : null).then(setCounts).catch(() => {})

    setCollapsed(true)
  }

  function clearAll() {
    setDraftEnts([]); setDraftAccts([]); setDraftPeriods([])
    setAppliedEnts([]); setAppliedAccts([]); setAppliedPeriods([])
    onFilterChange({ entityIds: [], accountIds: [] })
    fetch('/api/financials/counts').then(r => r.ok ? r.json() : null).then(setCounts).catch(() => {})
  }

  function toggleEnt(id: string) {
    setDraftEnts(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      // Reset draft accounts not in new entity selection
      if (next.length > 0) {
        setDraftAccts(prev => prev.filter(aid => {
          const a = accounts.find(x => x.id === aid)
          return a && next.includes(a.entityId || '')
        }))
      }
      return next
    })
  }

  function toggleAcct(id: string) {
    setDraftAccts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function togglePeriod(value: string) {
    setDraftPeriods(prev => prev.includes(value) ? prev.filter(x => x !== value) : [...prev, value])
  }

  const visibleAccounts = draftEnts.length > 0 ? accounts.filter(a => draftEnts.includes(a.entityId || '')) : accounts
  const hasApplied = appliedEnts.length > 0 || appliedAccts.length > 0 || appliedPeriods.length > 0

  const appliedSummary = () => {
    const parts: string[] = []
    if (appliedEnts.length) parts.push(entities.filter(e => appliedEnts.includes(e.id)).map(e => e.name).join(', '))
    if (appliedAccts.length) parts.push(`${appliedAccts.length} acct${appliedAccts.length > 1 ? 's' : ''}`)
    if (appliedPeriods.length) parts.push(periodOptions.filter(o => appliedPeriods.includes(o.value)).map(o => o.label).join(', '))
    return parts.join(' · ')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      {/* Header — always visible */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors rounded-xl select-none"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Filters</span>
          {hasApplied && (
            <span className="text-xs text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded">{appliedSummary()}</span>
          )}
          {hasApplied && (
            <span className="text-[10px] text-red-500 hover:underline font-medium cursor-pointer" onClick={e => { e.stopPropagation(); clearAll() }}>
              Clear all
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {counts && (
            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold text-gray-800">{Number(counts.total).toLocaleString()} txns</span>
              <span className="text-green-700">{formatAUD(Number(counts.total_income))} in</span>
              <span className="text-red-600">{formatAUD(Number(counts.total_spend))} out</span>
              {Number(counts.uncategorized) > 0 && (
                <Link href="/financials/categorize" className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 hover:bg-amber-100" onClick={e => e.stopPropagation()}>
                  <Tag className="h-3 w-3 text-amber-600" />
                  <span className="text-[10px] font-semibold text-amber-700">{Number(counts.uncategorized).toLocaleString()} uncategorized</span>
                </Link>
              )}
            </div>
          )}
          {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Body — collapsible */}
      {!collapsed && (
        <div className="px-4 pb-3 space-y-2 border-t border-gray-100 pt-2">
          {/* Entities — inline */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-14 shrink-0">Entity</span>
            {entities.map(e => (
              <Chip key={e.id} label={e.name} selected={draftEnts.includes(e.id)} color={e.color} onClick={() => toggleEnt(e.id)} />
            ))}
          </div>

          {/* Accounts — inline */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-14 shrink-0">Account</span>
            {visibleAccounts.map(a => (
              <Chip
                key={a.id}
                label={`${a.bankName} ••${a.accountNumberLast4 || ''}`}
                selected={draftAccts.includes(a.id)}
                onClick={() => toggleAcct(a.id)}
              />
            ))}
            {visibleAccounts.length === 0 && <span className="text-xs text-muted-foreground">No accounts</span>}
          </div>

          {/* Period — inline */}
          {showDateFilter && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-14 shrink-0">Period</span>
              {periodOptions.map(opt => (
                <Chip key={opt.value} label={opt.label} selected={draftPeriods.includes(opt.value)} onClick={() => togglePeriod(opt.value)} />
              ))}
            </div>
          )}

          {/* Apply / Clear — inline */}
          <div className="flex items-center gap-2 pt-1">
            <span className="w-14 shrink-0" />
            <Button onClick={applyFilters} size="sm" className="h-7 gap-1 text-xs" disabled={!isDirty && !hasApplied}>
              <Filter className="h-3 w-3" />
              {isDirty ? 'Apply' : 'Applied'}
            </Button>
            {(hasApplied || isDirty) && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={clearAll}>Clear</Button>
            )}
            {isDirty && (
              <span className="text-[10px] text-amber-600 font-medium">Changed — click Apply</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
