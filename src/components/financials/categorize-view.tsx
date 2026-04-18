'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Input } from '@/components/ui/input'
import { ArrowLeft, Save, Filter, CheckCircle2, Loader2, ChevronDown, ChevronRight, Search, Sparkles, Check, X } from 'lucide-react'
// Categories loaded from DB now
import toast from 'react-hot-toast'

interface Merchant {
  merchantName: string
  category: string | null
  subcategory: string | null
  aiSuggestedCategory: string | null
  txnCount: number
  totalAmount: number
  totalDebit: number
  totalCredit: number
  isDebitMostly: boolean
}

const formatAUD = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v)

interface DBCategory {
  id: string
  name: string
  sortOrder: number
  subcategories: { id: string; name: string }[]
}

// Category picker using native select for reliability
function CategoryPicker({ value, onChange, categories }: { value: string; onChange: (v: string) => void; categories: DBCategory[] }) {
  const isOther = !value || value === 'OTHER'

  return (
    <select
      value={value || 'OTHER'}
      onChange={(e) => onChange(e.target.value)}
      className={`h-8 w-full min-w-[200px] px-2 text-xs rounded-md border appearance-auto cursor-pointer ${
        isOther
          ? 'border-amber-300 bg-amber-50 text-amber-700 font-medium'
          : 'border-gray-200 bg-white text-gray-700'
      }`}
    >
      <option value="OTHER">⚠ Select category...</option>
      {categories.map((cat) => (
        <option key={cat.name} value={cat.name}>{cat.name}</option>
      ))}
    </select>
  )
}

export function CategorizeView({ initialSearch, onSearchClear, embedded }: { initialSearch?: string; onSearchClear?: () => void; embedded?: boolean }) {
  const router = useRouter()
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dbCategories, setDbCategories] = useState<DBCategory[]>([])
  // Hydrate filter prefs from localStorage (search intentionally not persisted — too transient)
  const prefs = (() => {
    if (typeof window === 'undefined') return null
    try { return JSON.parse(window.localStorage.getItem('categorize-prefs') || 'null') } catch { return null }
  })()
  const [filter, setFilter] = useState<'all' | 'uncategorized' | 'categorized'>(prefs?.filter ?? 'uncategorized')
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>(prefs?.direction ?? 'all')
  const [threshold, setThreshold] = useState<'all' | 'big' | 'medium' | 'small'>(prefs?.threshold ?? 'all')
  const [search, setSearch] = useState(initialSearch || '')
  const [sortBy, setSortBy] = useState<'amount' | 'txns'>(prefs?.sortBy ?? 'amount')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>(prefs?.sortDir ?? 'desc')
  const savePrefs = (patch: Partial<{ filter: string; direction: string; threshold: string; sortBy: string; sortDir: string }>) => {
    if (typeof window === 'undefined') return
    try {
      const current = JSON.parse(window.localStorage.getItem('categorize-prefs') || '{}')
      window.localStorage.setItem('categorize-prefs', JSON.stringify({ ...current, ...patch }))
    } catch {}
  }
  useEffect(() => {
    savePrefs({ filter, direction, threshold, sortBy, sortDir })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, direction, threshold, sortBy, sortDir])
  const [bulkCategory, setBulkCategory] = useState('')
  const [changes, setChanges] = useState<Map<string, string>>(new Map())
  const [stats, setStats] = useState({ uncategorized: 0, categorized: 0, total: 0 })
  const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null)
  const [merchantTxns, setMerchantTxns] = useState<any[]>([])
  const [loadingTxns, setLoadingTxns] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, string>>({})
  const [rejectedAi, setRejectedAi] = useState<Set<string>>(new Set())

  async function loadMerchants() {
    setLoading(true)
    try {
      const [merchRes, catRes] = await Promise.all([
        fetch('/api/financials/merchants'),
        fetch('/api/financials/categories'),
      ])
      if (merchRes.ok) {
        const data = await merchRes.json()
        setMerchants(data.merchants)
        setStats({ uncategorized: data.uncategorized, categorized: data.categorized, total: data.total })
      }
      if (catRes.ok) setDbCategories(await catRes.json())
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadMerchants() }, [])
  useEffect(() => { if (initialSearch) setSearch(initialSearch) }, [initialSearch])

  function setCategory(merchantName: string, category: string) {
    setChanges((prev) => {
      const next = new Map(prev)
      next.set(merchantName, category)
      return next
    })
  }

  function getEffectiveCategory(m: Merchant): string {
    return changes.get(m.merchantName) || m.category || 'OTHER'
  }

  function getAiSuggestion(m: Merchant): string | null {
    if (changes.has(m.merchantName)) return null
    if (rejectedAi.has(m.merchantName)) return null
    const live = aiSuggestions[m.merchantName]
    if (live) return live
    const stored = m.aiSuggestedCategory
    if (!stored) return null
    const current = m.category || 'OTHER'
    if (current !== 'OTHER' && current === stored) return null
    return stored
  }

  async function toggleMerchantTxns(merchantName: string) {
    if (expandedMerchant === merchantName) {
      setExpandedMerchant(null)
      return
    }
    setExpandedMerchant(merchantName)
    setLoadingTxns(true)
    try {
      const res = await fetch(`/api/financials/transactions?limit=20&merchant=${encodeURIComponent(merchantName)}`)
      if (res.ok) {
        const data = await res.json()
        setMerchantTxns(data.transactions || [])
      }
    } catch {}
    setLoadingTxns(false)
  }

  async function aiSuggest() {
    // Only process filtered rows that are uncategorized
    const uncategorized = filtered.filter(m => {
      const cat = changes.get(m.merchantName) || m.category
      return !cat || cat === 'OTHER'
    })
    if (uncategorized.length === 0) { toast.error('No uncategorized merchants in current view'); return }

    setAiLoading(true)
    try {
      const res = await fetch('/api/financials/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchants: uncategorized.map(m => ({
            merchantName: m.merchantName,
            totalAmount: Number(m.totalAmount),
            txnCount: Number(m.txnCount),
          })),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setAiSuggestions(data.suggestions)
        // Do NOT auto-apply — user must accept each one
        toast.success(`AI suggested categories for ${data.total} merchants (~$${data.estimated_cost.toFixed(3)}). Review and accept below.`)
      } else {
        toast.error('AI categorization failed')
      }
    } catch { toast.error('Failed') }
    setAiLoading(false)
  }

  function acceptSuggestion(merchantName: string) {
    // Source of truth: live session suggestion → DB-stored ai_suggested_category fallback
    const live = aiSuggestions[merchantName]
    const m = merchants.find(x => x.merchantName === merchantName)
    const cat = live || m?.aiSuggestedCategory
    if (!cat) return
    setChanges(prev => { const next = new Map(prev); next.set(merchantName, cat); return next })
    if (live) setAiSuggestions(prev => { const next = { ...prev }; delete next[merchantName]; return next })
  }

  function rejectSuggestion(merchantName: string) {
    setAiSuggestions(prev => { const next = { ...prev }; delete next[merchantName]; return next })
    setRejectedAi(prev => { const next = new Set(prev); next.add(merchantName); return next })
  }

  function applyBulkCategory() {
    if (!bulkCategory || bulkCategory === 'OTHER') return
    const newChanges = new Map(changes)
    for (const m of filtered) {
      newChanges.set(m.merchantName, bulkCategory)
      // Also remove from AI suggestions if present
      if (aiSuggestions[m.merchantName]) {
        setAiSuggestions(prev => { const next = { ...prev }; delete next[m.merchantName]; return next })
      }
    }
    setChanges(newChanges)
    toast.success(`Applied "${bulkCategory}" to ${filtered.length} merchants`)
    setBulkCategory('')
  }

  function acceptAllSuggestions() {
    const newChanges = new Map(changes)
    for (const [name, cat] of Object.entries(aiSuggestions)) {
      if (cat && cat !== 'OTHER') newChanges.set(name, cat)
    }
    setChanges(newChanges)
    setAiSuggestions({})
    toast.success(`Accepted ${Object.keys(aiSuggestions).length} suggestions`)
  }

  async function saveChanges() {
    if (changes.size === 0) return
    setSaving(true)
    try {
      const updates = Array.from(changes.entries()).map(([merchantName, category]) => ({
        merchantName,
        category,
      }))
      const res = await fetch('/api/financials/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Updated ${data.updated} transactions across ${changes.size} merchants`)
        setChanges(new Map())
        loadMerchants()
      } else {
        toast.error('Failed to save')
      }
    } catch { toast.error('Failed') }
    setSaving(false)
  }

  const filtered = merchants.filter((m) => {
    // Category filter — use the SAVED category (not draft changes) for filtering
    const savedCat = m.category || 'OTHER'
    if (filter === 'uncategorized' && savedCat !== 'OTHER') return false
    if (filter === 'categorized' && savedCat === 'OTHER') return false

    // Direction filter
    const credit = Number(m.totalCredit || 0)
    const debit = Number(m.totalDebit || 0)
    const isIncome = credit > debit
    if (direction === 'in' && !isIncome) return false
    if (direction === 'out' && isIncome) return false

    // Threshold filter (based on largest absolute amount)
    const maxAmt = Math.max(credit, debit)
    if (threshold === 'big' && maxAmt < 5000) return false
    if (threshold === 'medium' && (maxAmt < 500 || maxAmt >= 5000)) return false
    if (threshold === 'small' && maxAmt >= 500) return false

    // Search
    if (search && !m.merchantName.toLowerCase().includes(search.toLowerCase())) return false

    return true
  }).sort((a, b) => {
    // Income first, then expenses
    const aIsIncome = Number(a.totalCredit || 0) > Number(a.totalDebit || 0)
    const bIsIncome = Number(b.totalCredit || 0) > Number(b.totalDebit || 0)
    if (aIsIncome !== bIsIncome) return aIsIncome ? -1 : 1

    let cmp: number
    if (sortBy === 'txns') {
      cmp = Number(a.txnCount) - Number(b.txnCount)
    } else {
      const aVal = Math.max(Number(a.totalCredit || 0), Number(a.totalDebit || 0))
      const bVal = Math.max(Number(b.totalCredit || 0), Number(b.totalDebit || 0))
      cmp = aVal - bVal
    }
    return sortDir === 'desc' ? -cmp : cmp
  })

  // Max amounts for relative bars
  const maxCredit = Math.max(...filtered.map(m => Number(m.totalCredit || 0)), 1)
  const maxDebit = Math.max(...filtered.map(m => Number(m.totalDebit || 0)), 1)

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Loading merchants...</div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!embedded && (
            <button onClick={() => router.push('/')} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <h2 className={embedded ? 'text-sm font-semibold text-gray-700' : 'text-xl font-bold'}>Categorize Merchants</h2>
        </div>
        <div className="flex gap-2">
          <Button onClick={aiSuggest} disabled={aiLoading} variant="outline" className="gap-1.5">
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-500" />}
            {aiLoading ? 'AI thinking...' : 'AI Suggest'}
          </Button>
          {Object.keys(aiSuggestions).length > 0 && (
            <Button onClick={acceptAllSuggestions} variant="outline" className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50">
              <Check className="h-4 w-4" />
              Accept All {Object.keys(aiSuggestions).length} Suggestions
            </Button>
          )}
          {changes.size > 0 && (
            <Button onClick={saveChanges} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save {changes.size} Confirmed
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total Merchants</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{stats.uncategorized - changes.size}</p>
          <p className="text-xs text-amber-500">Need Categorizing</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-100 p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{stats.categorized + changes.size}</p>
          <p className="text-xs text-green-600">Categorized</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Category status */}
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          {(['uncategorized', 'all', 'categorized'] as const).map((f) => (
            <button
              key={f}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === f ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-muted/50 border border-gray-200'
              }`}
              onClick={() => setFilter(f)}
            >
              {f === 'uncategorized' ? `Uncategorized (${stats.uncategorized})` :
               f === 'categorized' ? `Categorized (${stats.categorized})` :
               `All (${stats.total})`}
            </button>
          ))}

          <div className="h-4 w-px bg-gray-200" />

          {/* Direction */}
          {(['all', 'in', 'out'] as const).map((d) => (
            <button
              key={d}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                direction === d
                  ? d === 'in' ? 'bg-green-600 text-white' : d === 'out' ? 'bg-red-500 text-white' : 'bg-blue-600 text-white'
                  : 'text-muted-foreground hover:bg-muted/50 border border-gray-200'
              }`}
              onClick={() => setDirection(d)}
            >
              {d === 'all' ? 'In & Out' : d === 'in' ? '↑ Income' : '↓ Expenses'}
            </button>
          ))}

          <div className="h-4 w-px bg-gray-200" />

          {/* Threshold */}
          {(['all', 'big', 'medium', 'small'] as const).map((t) => (
            <button
              key={t}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                threshold === t ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-muted/50 border border-gray-200'
              }`}
              onClick={() => setThreshold(t)}
            >
              {t === 'all' ? 'All $' : t === 'big' ? '$5K+' : t === 'medium' ? '$500–$5K' : '< $500'}
            </button>
          ))}

          <div className="h-4 w-px bg-gray-200" />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search merchant..."
              className="h-7 w-44 pl-7 text-xs"
            />
          </div>

          {/* Result count + unsaved */}
          <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} merchant{filtered.length !== 1 ? 's' : ''}</span>
          {changes.size > 0 && (
            <Badge className="bg-blue-100 text-blue-700 text-[10px]">
              {changes.size} unsaved
            </Badge>
          )}
        </div>

        {/* Bulk apply bar — shown when search or filters narrow the list */}
        {filtered.length > 0 && filtered.length < merchants.length && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <span className="text-xs text-muted-foreground shrink-0">Bulk apply to {filtered.length} shown:</span>
            <select
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              className="h-7 flex-1 max-w-[220px] px-2 text-xs rounded-md border border-gray-200 bg-white cursor-pointer"
            >
              <option value="">Choose category...</option>
              {dbCategories.map((cat) => (
                <option key={cat.name} value={cat.name}>{cat.name}</option>
              ))}
            </select>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={!bulkCategory}
              onClick={applyBulkCategory}
            >
              <Check className="h-3 w-3" />
              Apply to {filtered.length}
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Merchant</TableHead>
              <TableHead
                className="text-xs text-center cursor-pointer hover:text-blue-600 select-none"
                onClick={() => { if (sortBy === 'txns') setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortBy('txns'); setSortDir('desc') } }}
              >
                Txns {sortBy === 'txns' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </TableHead>
              <TableHead
                className="text-xs cursor-pointer hover:text-blue-600 select-none"
                onClick={() => { if (sortBy === 'amount') setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortBy('amount'); setSortDir('desc') } }}
              >
                Total Debit {sortBy === 'amount' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </TableHead>
              <TableHead
                className="text-xs cursor-pointer hover:text-blue-600 select-none"
                onClick={() => { if (sortBy === 'amount') setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortBy('amount'); setSortDir('desc') } }}
              >
                Total Credit {sortBy === 'amount' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </TableHead>
              <TableHead className="text-xs">Category</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((m) => {
              const effectiveCat = getEffectiveCategory(m)
              const hasChange = changes.has(m.merchantName)
              const suggestion = getAiSuggestion(m)
              const isExpanded = expandedMerchant === m.merchantName
              return (
                <>
                  <TableRow key={m.merchantName} className={`cursor-pointer ${hasChange ? 'bg-blue-50/40' : suggestion ? 'bg-amber-50/40' : 'hover:bg-muted/30'}`}>
                    <TableCell className="text-xs font-medium max-w-[250px]" onClick={() => toggleMerchantTxns(m.merchantName)}>
                      <div className="flex items-center gap-1.5">
                        {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                        <span className="truncate">{m.merchantName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-center" onClick={() => toggleMerchantTxns(m.merchantName)}>{Number(m.txnCount)}</TableCell>
                    <TableCell className="text-xs" onClick={() => toggleMerchantTxns(m.merchantName)}>
                      {m.totalDebit ? (
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-400 rounded-full transition-all"
                              style={{ width: `${(Number(m.totalDebit) / maxDebit) * 100}%` }}
                            />
                          </div>
                          <span className="text-red-600 font-medium w-20 text-right shrink-0">{formatAUD(Number(m.totalDebit))}</span>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs" onClick={() => toggleMerchantTxns(m.merchantName)}>
                      {m.totalCredit ? (
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-400 rounded-full transition-all"
                              style={{ width: `${(Number(m.totalCredit) / maxCredit) * 100}%` }}
                            />
                          </div>
                          <span className="text-green-600 font-medium w-20 text-right shrink-0">{formatAUD(Number(m.totalCredit))}</span>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {suggestion && !hasChange ? (
                          <>
                            <span className="text-xs text-amber-700 font-medium truncate max-w-[130px]" title={suggestion}>
                              AI: {suggestion}
                            </span>
                            <button
                              type="button"
                              className="h-5 w-5 rounded bg-green-100 text-green-700 hover:bg-green-200 flex items-center justify-center shrink-0"
                              title="Accept"
                              onClick={() => acceptSuggestion(m.merchantName)}
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              className="h-5 w-5 rounded bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center shrink-0"
                              title="Reject"
                              onClick={() => rejectSuggestion(m.merchantName)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <CategoryPicker
                            value={effectiveCat}
                            onChange={(v) => setCategory(m.merchantName, v)}
                            categories={dbCategories}
                          />
                        )}
                        {hasChange && aiSuggestions[m.merchantName] === undefined && changes.get(m.merchantName) !== m.category && (
                          <Badge className="bg-blue-100 text-blue-700 text-[9px] shrink-0">✓</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${m.merchantName}-txns`}>
                      <TableCell colSpan={5} className="p-0 bg-gray-50/70">
                        {loadingTxns ? (
                          <div className="text-xs text-muted-foreground text-center py-3">Loading transactions...</div>
                        ) : (
                          <div className="px-6 py-2 space-y-0.5 max-h-60 overflow-y-auto">
                            <div className="flex items-center gap-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide pb-1 border-b border-gray-200">
                              <span className="w-20">Date</span>
                              <span className="flex-1">Description</span>
                              <span className="w-16 text-right">Account</span>
                              <span className="w-20 text-right">Amount</span>
                            </div>
                            {merchantTxns.map((t: any) => (
                              <div key={t.id} className="flex items-center gap-3 text-xs py-1 border-b border-gray-100 last:border-0">
                                <span className="w-20 text-muted-foreground shrink-0">{t.transactionDate}</span>
                                <span className="flex-1 truncate text-gray-700">{t.descriptionRaw}</span>
                                <span className="w-16 text-right text-muted-foreground text-[10px] shrink-0">{t.bankName} {t.accountName ? '' : ''}</span>
                                <span className={`w-20 text-right font-medium shrink-0 ${Number(t.amount) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {formatAUD(Math.abs(Number(t.amount)))}
                                </span>
                              </div>
                            ))}
                            {merchantTxns.length === 0 && (
                              <div className="text-xs text-muted-foreground py-2">No transactions found</div>
                            )}
                            {merchantTxns.length >= 20 && (
                              <div className="text-[10px] text-muted-foreground py-1 text-center">Showing first 20 transactions</div>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  {filter === 'uncategorized' ? (
                    <div className="space-y-2">
                      <CheckCircle2 className="h-8 w-8 mx-auto text-green-500" />
                      <p className="text-sm text-muted-foreground">All merchants are categorized!</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No merchants to show.</p>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Sticky save bar */}
      {(changes.size > 0 || Object.keys(aiSuggestions).length > 0) && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 rounded-xl shadow-lg p-4 flex items-center justify-between">
          <div className="text-sm space-y-0.5">
            {changes.size > 0 && (
              <div><span className="font-semibold text-blue-700">{changes.size}</span> confirmed — ready to save</div>
            )}
            {Object.keys(aiSuggestions).length > 0 && (
              <div><span className="font-semibold text-amber-600">{Object.keys(aiSuggestions).length}</span> AI suggestions — review with ✓ / ✗</div>
            )}
          </div>
          <div className="flex gap-2">
            {Object.keys(aiSuggestions).length > 0 && (
              <Button variant="outline" className="gap-1 border-amber-300 text-amber-700" onClick={acceptAllSuggestions}>
                <Check className="h-3.5 w-3.5" /> Accept All AI
              </Button>
            )}
            {changes.size > 0 && (
              <>
                <Button variant="outline" onClick={() => { setChanges(new Map()); setAiSuggestions({}) }}>Discard All</Button>
                <Button onClick={saveChanges} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save {changes.size} Confirmed
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
