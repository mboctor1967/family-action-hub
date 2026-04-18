'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Tag, Check, Filter } from 'lucide-react'

interface Entity { id: string; name: string; type: string; color: string }
interface Account { id: string; bankName: string; accountName: string | null; accountNumber: string | null; accountNumberLast4: string | null; entityId: string | null; accountType: string | null }
interface Counts { total: number; income: number; expenses: number; total_income: number; total_spend: number; uncategorized: number; unique_merchants: number }
interface PeriodOption { value: string; label: string; from: string; to: string }

export interface FilterState { entityIds: string[]; accountIds: string[]; accountTypes?: string[]; from?: string; to?: string }

const ACCOUNT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'personal_cheque', label: 'Transaction' },
  { value: 'personal_savings', label: 'Savings' },
  { value: 'business_cheque', label: 'Business' },
  { value: 'credit_card', label: 'Credit Card' },
]

interface Props {
  onFilterChange: (filters: FilterState) => void
  showDateFilter?: boolean
  /** When set, selections persist in localStorage under this key. */
  storageKey?: string
}

interface PersistedState {
  ents: string[]
  accts: string[]
  types: string[]
  periods: string[]
}

function loadPersisted(key: string | undefined): PersistedState | null {
  if (!key || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`filter:${key}`)
    if (!raw) return null
    const v = JSON.parse(raw)
    return {
      ents: Array.isArray(v.ents) ? v.ents : [],
      accts: Array.isArray(v.accts) ? v.accts : [],
      types: Array.isArray(v.types) ? v.types : [],
      periods: Array.isArray(v.periods) ? v.periods : [],
    }
  } catch { return null }
}

function savePersisted(key: string | undefined, s: PersistedState) {
  if (!key || typeof window === 'undefined') return
  try { window.localStorage.setItem(`filter:${key}`, JSON.stringify(s)) } catch {}
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

export function AccountFilter({ onFilterChange, showDateFilter = true, storageKey }: Props) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const periodOptions = buildPeriodOptions()

  // Hydrate once from localStorage (SSR-safe: returns null on server, data on client first render).
  const persisted = typeof window !== 'undefined' ? loadPersisted(storageKey) : null

  // Draft selections (not applied yet)
  const [draftEnts, setDraftEnts] = useState<string[]>(persisted?.ents ?? [])
  const [draftAccts, setDraftAccts] = useState<string[]>(persisted?.accts ?? [])
  const [draftTypes, setDraftTypes] = useState<string[]>(persisted?.types ?? [])
  const [draftPeriods, setDraftPeriods] = useState<string[]>(persisted?.periods ?? [])

  // Applied selections (what's actually filtering)
  const [appliedEnts, setAppliedEnts] = useState<string[]>(persisted?.ents ?? [])
  const [appliedAccts, setAppliedAccts] = useState<string[]>(persisted?.accts ?? [])
  const [appliedTypes, setAppliedTypes] = useState<string[]>(persisted?.types ?? [])
  const [appliedPeriods, setAppliedPeriods] = useState<string[]>(persisted?.periods ?? [])

  const isDirty = JSON.stringify({ e: draftEnts, a: draftAccts, t: draftTypes, p: draftPeriods }) !==
                  JSON.stringify({ e: appliedEnts, a: appliedAccts, t: appliedTypes, p: appliedPeriods })

  useEffect(() => {
    Promise.all([
      fetch('/api/financials/entities').then(r => r.ok ? r.json() : []),
      fetch('/api/financials/accounts').then(r => r.ok ? r.json() : []),
    ]).then(([e, a]) => { setEntities(e); setAccounts(a) }).catch(() => {})

    // If we hydrated applied state from localStorage, push it up to the parent + collapse filters.
    if (persisted && (persisted.ents.length || persisted.accts.length || persisted.types.length || persisted.periods.length)) {
      const dates = computeDateRangeRaw(persisted.periods)
      const effectiveAcctIds = persisted.accts // accounts list may not be loaded yet; fine — API handles raw IDs.
      onFilterChange({ entityIds: persisted.ents, accountIds: effectiveAcctIds, accountTypes: persisted.types, ...dates })
      setCollapsed(true)
      const params = new URLSearchParams()
      if (persisted.ents.length) params.set('entity_ids', persisted.ents.join(','))
      if (effectiveAcctIds.length) params.set('account_ids', effectiveAcctIds.join(','))
      if (dates.from) params.set('from', dates.from)
      if (dates.to) params.set('to', dates.to)
      fetch(`/api/financials/counts?${params}`).then(r => r.ok ? r.json() : null).then(setCounts).catch(() => {})
    } else {
      fetch('/api/financials/counts').then(r => r.ok ? r.json() : null).then(setCounts).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Raw date-range computation (no dependency on periodOptions state reordering).
  function computeDateRangeRaw(pIds: string[]): { from?: string; to?: string } {
    if (!pIds.length) return {}
    const sel = periodOptions.filter(o => pIds.includes(o.value))
    return { from: sel.map(o => o.from).sort()[0], to: sel.map(o => o.to).sort().reverse()[0] }
  }

  function computeDateRange(pIds: string[]): { from?: string; to?: string } {
    if (!pIds.length) return {}
    const sel = periodOptions.filter(o => pIds.includes(o.value))
    return { from: sel.map(o => o.from).sort()[0], to: sel.map(o => o.to).sort().reverse()[0] }
  }

  // Translate selected types into account IDs (intersect with explicit accounts if any),
  // so downstream APIs that only know entity_ids / account_ids still get the right filter.
  function resolveAccountIds(explicit: string[], types: string[]): string[] {
    if (types.length === 0) return explicit
    const typeMatchIds = accounts.filter(a => a.accountType && types.includes(a.accountType)).map(a => a.id)
    if (explicit.length === 0) return typeMatchIds
    const typeSet = new Set(typeMatchIds)
    return explicit.filter(id => typeSet.has(id))
  }

  function applyFilters() {
    setAppliedEnts([...draftEnts])
    setAppliedAccts([...draftAccts])
    setAppliedTypes([...draftTypes])
    setAppliedPeriods([...draftPeriods])
    savePersisted(storageKey, { ents: draftEnts, accts: draftAccts, types: draftTypes, periods: draftPeriods })

    const dates = computeDateRange(draftPeriods)
    const effectiveAccountIds = resolveAccountIds(draftAccts, draftTypes)
    const filter: FilterState = { entityIds: draftEnts, accountIds: effectiveAccountIds, accountTypes: draftTypes, ...dates }
    onFilterChange(filter)

    // Fetch counts
    const params = new URLSearchParams()
    if (draftEnts.length) params.set('entity_ids', draftEnts.join(','))
    if (effectiveAccountIds.length) params.set('account_ids', effectiveAccountIds.join(','))
    if (dates.from) params.set('from', dates.from)
    if (dates.to) params.set('to', dates.to)
    fetch(`/api/financials/counts?${params}`).then(r => r.ok ? r.json() : null).then(setCounts).catch(() => {})

    setCollapsed(true)
  }

  function clearAll() {
    setDraftEnts([]); setDraftAccts([]); setDraftTypes([]); setDraftPeriods([])
    setAppliedEnts([]); setAppliedAccts([]); setAppliedTypes([]); setAppliedPeriods([])
    savePersisted(storageKey, { ents: [], accts: [], types: [], periods: [] })
    onFilterChange({ entityIds: [], accountIds: [], accountTypes: [] })
    fetch('/api/financials/counts').then(r => r.ok ? r.json() : null).then(setCounts).catch(() => {})
  }

  function toggleType(value: string) {
    setDraftTypes(prev => prev.includes(value) ? prev.filter(x => x !== value) : [...prev, value])
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

  // Account chips are narrowed by both entity and type selections.
  const visibleAccounts = accounts.filter(a => {
    if (draftEnts.length > 0 && !draftEnts.includes(a.entityId || '')) return false
    if (draftTypes.length > 0 && !(a.accountType && draftTypes.includes(a.accountType))) return false
    return true
  })
  const hasApplied = appliedEnts.length > 0 || appliedAccts.length > 0 || appliedTypes.length > 0 || appliedPeriods.length > 0

  const appliedSummary = () => {
    const parts: string[] = []
    if (appliedEnts.length) parts.push(entities.filter(e => appliedEnts.includes(e.id)).map(e => e.name).join(', '))
    if (appliedTypes.length) parts.push(ACCOUNT_TYPE_OPTIONS.filter(o => appliedTypes.includes(o.value)).map(o => o.label).join(', '))
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

          {/* Account type — inline */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-14 shrink-0">Type</span>
            {ACCOUNT_TYPE_OPTIONS.map(o => (
              <Chip key={o.value} label={o.label} selected={draftTypes.includes(o.value)} onClick={() => toggleType(o.value)} />
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
