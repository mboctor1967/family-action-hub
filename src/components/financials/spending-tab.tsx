'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { type FilterState } from './account-filter'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Tag, Zap, Waves } from 'lucide-react'
import { CATEGORIES } from '@/types/financials'
import toast from 'react-hot-toast'

interface CategoryVolatility {
  cv: number
  peak_month_share: number
  active_months: number
  total_months: number
  peak_month: { month: string; amount: number } | null
  volatility_level: 'smooth' | 'mild' | 'lumpy'
}

interface SpendingCategory {
  category: string
  amount: number
  percentage: number
  transaction_count: number
  confirmed_count?: number
  ai_only_count?: number
  is_ai_only?: boolean
  vs_prior_period: number | null
  volatility?: CategoryVolatility
}

interface BigTransaction {
  id: string
  transactionDate: string
  descriptionRaw: string
  merchantName: string
  amount: string
  category: string
}

interface SpendingData {
  period: { from: string; to: string }
  categories: SpendingCategory[]
  total_spending: number
  biggest_transactions: BigTransaction[]
}

const COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#06b6d4', '#a3a3a3',
]

const formatAUD = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v)

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const formatMonthLabel = (month: string) => {
  const [y, m] = month.split('-')
  return `${MONTH_SHORT[parseInt(m, 10) - 1] || m} ${y.slice(2)}`
}
const formatMonthFull = (month: string) => {
  const [y, m] = month.split('-')
  return `${MONTH_SHORT[parseInt(m, 10) - 1] || m} ${y}`
}

export function SpendingTab({ filter, filterKey, onCategorize }: { filter: FilterState; filterKey: number; onCategorize?: (search?: string) => void }) {
  const [data, setData] = useState<SpendingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [categoryTxns, setCategoryTxns] = useState<any[]>([])
  const [loadingTxns, setLoadingTxns] = useState(false)
  const [categoryTrend, setCategoryTrend] = useState<{ monthly: { month: string; amount: number; count: number }[]; summary: { total: number; txn_count: number; avg_per_month: number; avg_per_txn: number; highest_month: { month: string; amount: number } | null; lowest_month: { month: string; amount: number } | null } } | null>(null)
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [subcategoriesByCategory, setSubcategoriesByCategory] = useState<Record<string, string[]>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/financials/categories')
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const dbNames = rows.map(r => r.name).filter(Boolean)
        const merged = Array.from(new Set([...Object.keys(CATEGORIES), ...dbNames])).sort()
        setAllCategories(merged)
        const subMap: Record<string, string[]> = {}
        // From the constant enum
        for (const [cat, subs] of Object.entries(CATEGORIES)) {
          subMap[cat] = [...(subs as readonly string[])]
        }
        // Merge in DB-stored subcategories
        for (const row of rows) {
          const name: string = row.name
          const subs: string[] = (row.subcategories ?? []).map((s: any) => s.name).filter(Boolean)
          subMap[name] = Array.from(new Set([...(subMap[name] ?? []), ...subs]))
        }
        setSubcategoriesByCategory(subMap)
      })
      .catch(() => {
        setAllCategories(Object.keys(CATEGORIES))
        const fallback: Record<string, string[]> = {}
        for (const [cat, subs] of Object.entries(CATEGORIES)) fallback[cat] = [...(subs as readonly string[])]
        setSubcategoriesByCategory(fallback)
      })
  }, [])

  async function patchTxn(txnId: string, patch: Record<string, any>, successMsg?: string) {
    const current = categoryTxns.find(t => t.id === txnId)
    if (!current) return
    const snapshot = { ...current }
    setSavingId(txnId)
    setCategoryTxns(prev => prev.map(t => t.id === txnId ? { ...t, ...patch } : t))
    try {
      const res = await fetch(`/api/financials/transactions/${txnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `Save failed (${res.status})`)
      }
      if (successMsg) toast.success(successMsg)
      // If the category was changed and the txn no longer belongs to this drill-down, drop it
      if (patch.category && expandedCategory && patch.category !== expandedCategory) {
        setCategoryTxns(prev => prev.filter(t => t.id !== txnId))
      }
    } catch (e: any) {
      setCategoryTxns(prev => prev.map(t => t.id === txnId ? snapshot : t))
      toast.error(e?.message || 'Save failed')
    } finally {
      setSavingId(null)
    }
  }

  function changeCategory(txnId: string, newCategory: string) {
    // When category changes, clear subcategory (old sub-cat won't match new category)
    return patchTxn(txnId, { category: newCategory, subcategory: null }, `Moved to ${newCategory}`)
  }

  function changeSubcategory(txnId: string, newSubcategory: string) {
    return patchTxn(txnId, { subcategory: newSubcategory || null })
  }
  const [sortKey, setSortKey] = useState<'date' | 'merchant' | 'amount' | 'account'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [catSortKey, setCatSortKey] = useState<'category' | 'amount' | 'percentage' | 'count' | 'vs_prior'>('amount')
  const [catSortDir, setCatSortDir] = useState<'asc' | 'desc'>('desc')
  const toggleCatSort = (key: typeof catSortKey) => {
    if (catSortKey === key) setCatSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setCatSortKey(key); setCatSortDir(key === 'category' ? 'asc' : 'desc') }
  }
  const catSortArrow = (key: string) => catSortKey === key ? (catSortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const sortedCategoryTxns = (() => {
    const copy = [...categoryTxns]
    copy.sort((a, b) => {
      let av: any, bv: any
      switch (sortKey) {
        case 'date': av = a.transactionDate; bv = b.transactionDate; break
        case 'merchant': av = (a.merchantName || a.descriptionRaw || '').toLowerCase(); bv = (b.merchantName || b.descriptionRaw || '').toLowerCase(); break
        case 'amount': av = Math.abs(Number(a.amount)); bv = Math.abs(Number(b.amount)); break
        case 'account': av = `${a.bankName || ''} ${a.accountName || ''}`.toLowerCase(); bv = `${b.bankName || ''} ${b.accountName || ''}`.toLowerCase(); break
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return copy
  })()

  const toggleSort = (key: 'date' | 'merchant' | 'amount' | 'account') => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'amount' ? 'desc' : 'asc') }
  }
  const sortArrow = (key: string) => sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : ''

  // Date range — use filter dates or default to current Australian FY
  const now = new Date()
  const defaultFYStart = now.getMonth() >= 6 ? `${now.getFullYear()}-07-01` : `${now.getFullYear() - 1}-07-01`
  // Hydrate UI prefs from localStorage (browser-side, SSR-safe).
  const prefs = (() => {
    if (typeof window === 'undefined') return null
    try { return JSON.parse(window.localStorage.getItem('spending-prefs') || 'null') } catch { return null }
  })()
  const [fromDate, setFromDate] = useState<string>(prefs?.from || defaultFYStart)
  const [toDate, setToDate] = useState<string>(prefs?.to || now.toISOString().slice(0, 10))
  const [useAi, setUseAi] = useState<boolean>(prefs?.useAi ?? true)
  const [includeTransfers, setIncludeTransfers] = useState<boolean>(prefs?.includeTransfers ?? false)
  const savePrefs = (patch: Partial<{ from: string; to: string; useAi: boolean; includeTransfers: boolean }>) => {
    if (typeof window === 'undefined') return
    try {
      const current = JSON.parse(window.localStorage.getItem('spending-prefs') || '{}')
      window.localStorage.setItem('spending-prefs', JSON.stringify({ ...current, ...patch }))
    } catch {}
  }

  function loadData(from: string, to: string, aiFlag = useAi, transfersFlag = includeTransfers) {
    setLoading(true)
    const params = new URLSearchParams({ from, to })
    if (filter.accountIds.length > 0) params.set('account_ids', filter.accountIds.join(','))
    if (filter.entityIds.length > 0) params.set('entity_ids', filter.entityIds.join(','))
    if (aiFlag) params.set('use_ai', '1')
    if (transfersFlag) params.set('include_transfers', '1')
    fetch(`/api/financials/spending?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  // Reload when filter changes from parent
  useEffect(() => {
    const from = filter.from || fromDate
    const to = filter.to || toDate
    if (filter.from) setFromDate(from)
    if (filter.to) setToDate(to)
    setExpandedCategory(null)
    loadData(from, to)
  }, [filterKey])

  // Initial load
  useEffect(() => { loadData(fromDate, toDate) }, [])

  function handleApply() {
    setExpandedCategory(null)
    loadData(fromDate, toDate)
  }

  async function toggleCategory(category: string) {
    if (expandedCategory === category) {
      setExpandedCategory(null)
      return
    }
    setExpandedCategory(category)
    setLoadingTxns(true)
    setCategoryTrend(null)

    const baseParams = new URLSearchParams({ category, from: fromDate, to: toDate })
    if (useAi) baseParams.set('use_ai', '1')
    if (includeTransfers) baseParams.set('include_transfers', '1')
    if (filter.accountIds.length > 0) baseParams.set('account_ids', filter.accountIds.join(','))
    if (filter.entityIds.length > 0) baseParams.set('entity_ids', filter.entityIds.join(','))

    try {
      const txnParams = new URLSearchParams(baseParams)
      txnParams.set('limit', '1000')
      const [txnRes, trendRes] = await Promise.all([
        fetch(`/api/financials/transactions?${txnParams}`),
        fetch(`/api/financials/spending/trend?${baseParams}`),
      ])
      if (txnRes.ok) {
        const d = await txnRes.json()
        setCategoryTxns(d.transactions || [])
      }
      if (trendRes.ok) {
        setCategoryTrend(await trendRes.json())
      }
    } catch {}
    setLoadingTxns(false)
  }

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
  if (!data || data.categories.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">No spending data for this period.</div>
  }

  const pieData = data.categories.map((c) => ({
    name: c.category || 'OTHER',
    value: c.amount,
  }))

  return (
    <div className="space-y-6">
      {/* Date range + toggles */}
      <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">Period:</span>
        <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); savePrefs({ from: e.target.value }) }} className="h-8 w-36 text-xs" />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); savePrefs({ to: e.target.value }) }} className="h-8 w-36 text-xs" />
        <Button size="sm" className="h-8 text-xs" onClick={handleApply}>Apply</Button>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none ml-2">
          <input
            type="checkbox"
            checked={useAi}
            onChange={(e) => { setUseAi(e.target.checked); savePrefs({ useAi: e.target.checked }); loadData(fromDate, toDate, e.target.checked, includeTransfers) }}
            className="rounded"
          />
          Use AI suggestions
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeTransfers}
            onChange={(e) => { setIncludeTransfers(e.target.checked); savePrefs({ includeTransfers: e.target.checked }); loadData(fromDate, toDate, useAi, e.target.checked) }}
            className="rounded"
          />
          Include transfers
        </label>
        <span className="ml-auto text-sm font-semibold">{formatAUD(data.total_spending)} total</span>
      </div>

      {useAi && (() => {
        const aiOnly = data.categories.reduce((s, c) => s + (c.ai_only_count ?? 0), 0)
        const confirmed = data.categories.reduce((s, c) => s + (c.confirmed_count ?? 0), 0)
        if (aiOnly === 0) return null
        return (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Using AI-suggested categories for <strong>{aiOnly.toLocaleString()}</strong> transactions where no confirmed category exists.{' '}
            {confirmed.toLocaleString()} confirmed.{' '}
            {onCategorize && (
              <button className="underline text-amber-800" onClick={() => onCategorize?.()}>
                Review / confirm them
              </button>
            )}
          </div>
        )
      })()}

      {/* Donut chart + Category table side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Spending by Category</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatAUD(Number(value))} />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                wrapperStyle={{ fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Biggest transactions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Biggest Transactions</h3>
          <div className="space-y-2">
            {data.biggest_transactions.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-muted-foreground w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t.merchantName || t.descriptionRaw}</p>
                  <p className="text-muted-foreground">{t.transactionDate}</p>
                </div>
                <span className="font-semibold text-red-600">{formatAUD(Math.abs(Number(t.amount)))}</span>
              </div>
            ))}
            {data.biggest_transactions.length === 0 && (
              <p className="text-muted-foreground text-xs">No transactions</p>
            )}
          </div>
        </div>
      </div>

      {/* Category breakdown table with drill-down */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs w-8"></TableHead>
              <TableHead className="text-xs cursor-pointer select-none hover:text-gray-700" onClick={() => toggleCatSort('category')}>
                Category{catSortArrow('category')}
              </TableHead>
              <TableHead className="text-xs text-right cursor-pointer select-none hover:text-gray-700" onClick={() => toggleCatSort('amount')}>
                Amount{catSortArrow('amount')}
              </TableHead>
              <TableHead className="text-xs text-center cursor-pointer select-none hover:text-gray-700" onClick={() => toggleCatSort('percentage')}>
                % of Total{catSortArrow('percentage')}
              </TableHead>
              <TableHead className="text-xs text-center cursor-pointer select-none hover:text-gray-700" onClick={() => toggleCatSort('count')}>
                Transactions{catSortArrow('count')}
              </TableHead>
              <TableHead className="text-xs text-center cursor-pointer select-none hover:text-gray-700" onClick={() => toggleCatSort('vs_prior')}>
                vs Prior Period{catSortArrow('vs_prior')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...data.categories].sort((a, b) => {
              let av: any, bv: any
              switch (catSortKey) {
                case 'category': av = (a.category || '').toLowerCase(); bv = (b.category || '').toLowerCase(); break
                case 'amount': av = a.amount; bv = b.amount; break
                case 'percentage': av = a.percentage; bv = b.percentage; break
                case 'count': av = a.transaction_count; bv = b.transaction_count; break
                case 'vs_prior': av = a.vs_prior_period ?? -Infinity; bv = b.vs_prior_period ?? -Infinity; break
              }
              if (av < bv) return catSortDir === 'asc' ? -1 : 1
              if (av > bv) return catSortDir === 'asc' ? 1 : -1
              return 0
            }).map((cat, idx) => (
              <>
                <TableRow
                  key={cat.category}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => toggleCategory(cat.category)}
                >
                  <TableCell className="text-xs">
                    {expandedCategory === cat.category
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-xs font-medium">{cat.category || 'OTHER'}</span>
                      {cat.is_ai_only && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">AI</span>
                      )}
                      {cat.volatility && cat.volatility.volatility_level !== 'smooth' && (() => {
                        const v = cat.volatility
                        const tip = [
                          `Peak month: ${v.peak_month ? `${v.peak_month.month} (${Math.round(v.peak_month_share * 100)}% of total)` : '—'}`,
                          `Active months: ${v.active_months}/${v.total_months}`,
                          `Volatility (CV): ${v.cv.toFixed(2)}`,
                        ].join(' · ')
                        const Icon = v.volatility_level === 'lumpy' ? Zap : Waves
                        const color = v.volatility_level === 'lumpy' ? 'text-amber-600' : 'text-blue-500'
                        return (
                          <span title={tip} className={`inline-flex items-center ${color}`} onClick={(e) => e.stopPropagation()}>
                            <Icon className="h-3 w-3" />
                          </span>
                        )
                      })()}
                      {!cat.is_ai_only && (cat.ai_only_count ?? 0) > 0 && (
                        <span
                          className="text-[9px] text-amber-600"
                          title={`${cat.ai_only_count} AI-suggested of ${cat.transaction_count} in this category`}
                        >
                          ({cat.ai_only_count} AI)
                        </span>
                      )}
                      {(cat.category === 'OTHER' || !cat.category) && onCategorize && (
                        <button
                          className="text-[10px] text-amber-600 hover:underline flex items-center gap-0.5"
                          onClick={(e) => { e.stopPropagation(); onCategorize() }}
                        >
                          <Tag className="h-2.5 w-2.5" /> categorize
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-right font-medium">{formatAUD(cat.amount)}</TableCell>
                  <TableCell className="text-xs text-center">{cat.percentage}%</TableCell>
                  <TableCell className="text-xs text-center">{cat.transaction_count}</TableCell>
                  <TableCell className="text-xs text-center">
                    {cat.vs_prior_period !== null ? (
                      <span className={`inline-flex items-center gap-0.5 ${cat.vs_prior_period > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {cat.vs_prior_period > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {cat.vs_prior_period > 0 ? '+' : ''}{cat.vs_prior_period}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
                {expandedCategory === cat.category && (
                  <TableRow key={`${cat.category}-expanded`}>
                    <TableCell colSpan={6} className="p-0 bg-gray-50/50">
                      {loadingTxns ? (
                        <p className="text-xs text-muted-foreground text-center py-3">Loading...</p>
                      ) : (
                        <div className="px-8 py-3 space-y-4">
                          {categoryTrend && (
                            <>
                              {/* Stat strip */}
                              <div className="grid grid-cols-4 gap-2">
                                <div className="rounded-lg border border-gray-100 p-2">
                                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Avg / month</p>
                                  <p className="text-sm font-semibold tabular-nums">{formatAUD(categoryTrend.summary.avg_per_month)}</p>
                                </div>
                                <div className="rounded-lg border border-gray-100 p-2">
                                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                                    Highest {categoryTrend.summary.highest_month ? `(${formatMonthLabel(categoryTrend.summary.highest_month.month)})` : ''}
                                  </p>
                                  <p className="text-sm font-semibold tabular-nums">
                                    {categoryTrend.summary.highest_month ? formatAUD(categoryTrend.summary.highest_month.amount) : '—'}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-gray-100 p-2">
                                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                                    Lowest {categoryTrend.summary.lowest_month ? `(${formatMonthLabel(categoryTrend.summary.lowest_month.month)})` : ''}
                                  </p>
                                  <p className="text-sm font-semibold tabular-nums">
                                    {categoryTrend.summary.lowest_month ? formatAUD(categoryTrend.summary.lowest_month.amount) : '—'}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-gray-100 p-2">
                                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Avg / transaction</p>
                                  <p className="text-sm font-semibold tabular-nums">{formatAUD(categoryTrend.summary.avg_per_txn)}</p>
                                </div>
                              </div>
                              {/* Line chart */}
                              <div className="rounded-lg border border-gray-100 p-2">
                                <ResponsiveContainer width="100%" height={180}>
                                  <LineChart data={categoryTrend.monthly} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                    <XAxis
                                      dataKey="month"
                                      tick={{ fontSize: 10 }}
                                      tickFormatter={(m: string) => formatMonthLabel(m)}
                                    />
                                    <YAxis
                                      tick={{ fontSize: 10 }}
                                      tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
                                    />
                                    <Tooltip
                                      formatter={(value: any) => formatAUD(Number(value))}
                                      labelFormatter={(label: any) => formatMonthFull(String(label ?? ''))}
                                    />
                                    <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </>
                          )}
                          <div className="text-[10px] text-muted-foreground">
                            Showing {categoryTxns.length.toLocaleString()} transaction{categoryTxns.length === 1 ? '' : 's'}
                            {categoryTxns.length >= 1000 && ' (capped at 1000)'}
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-muted-foreground border-b border-gray-200">
                                <th className="py-1 pr-3 font-medium cursor-pointer select-none hover:text-gray-700 w-24" onClick={() => toggleSort('date')}>
                                  Date {sortArrow('date')}
                                </th>
                                <th className="py-1 pr-3 font-medium cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('merchant')}>
                                  Merchant / Description {sortArrow('merchant')}
                                </th>
                                <th className="py-1 pr-3 font-medium cursor-pointer select-none hover:text-gray-700 w-40" onClick={() => toggleSort('account')}>
                                  Account {sortArrow('account')}
                                </th>
                                <th className="py-1 pr-3 font-medium cursor-pointer select-none hover:text-gray-700 w-24 text-right" onClick={() => toggleSort('amount')}>
                                  Amount {sortArrow('amount')}
                                </th>
                                <th className="py-1 pr-3 font-medium w-44">Category</th>
                                <th className="py-1 pr-3 font-medium w-40">Sub-category</th>
                                <th className="py-1 w-12" />
                              </tr>
                            </thead>
                            <tbody>
                              {sortedCategoryTxns.map((t: any) => (
                                <tr key={t.id} className="border-b border-gray-100 last:border-0">
                                  <td className="py-1 pr-3 text-muted-foreground tabular-nums">{t.transactionDate}</td>
                                  <td className="py-1 pr-3 truncate max-w-0">{t.merchantName || t.descriptionRaw}</td>
                                  <td className="py-1 pr-3 text-muted-foreground truncate max-w-0">
                                    {t.bankName}{t.accountName ? ` · ${t.accountName}` : ''}
                                  </td>
                                  <td className="py-1 pr-3 font-medium tabular-nums text-right">{formatAUD(Math.abs(Number(t.amount)))}</td>
                                  <td className="py-1 pr-3">
                                    <select
                                      value={t.category || ''}
                                      disabled={savingId === t.id}
                                      onChange={(e) => changeCategory(t.id, e.target.value)}
                                      className="h-6 w-full text-[11px] border border-gray-200 rounded px-1 bg-white hover:border-gray-400 disabled:opacity-50"
                                    >
                                      {!t.category && <option value="">(uncategorised)</option>}
                                      {t.category && !allCategories.includes(t.category) && (
                                        <option value={t.category}>{t.category}</option>
                                      )}
                                      {allCategories.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-1 pr-3">
                                    {(() => {
                                      const subs = t.category ? (subcategoriesByCategory[t.category] ?? []) : []
                                      const hasCurrent = t.subcategory && !subs.includes(t.subcategory)
                                      return (
                                        <select
                                          value={t.subcategory || ''}
                                          disabled={savingId === t.id || !t.category || subs.length === 0}
                                          onChange={(e) => changeSubcategory(t.id, e.target.value)}
                                          className="h-6 w-full text-[11px] border border-gray-200 rounded px-1 bg-white hover:border-gray-400 disabled:opacity-50 disabled:bg-gray-50"
                                          title={!t.category ? 'Pick a category first' : subs.length === 0 ? 'No sub-categories defined' : ''}
                                        >
                                          <option value="">(none)</option>
                                          {hasCurrent && <option value={t.subcategory}>{t.subcategory}</option>}
                                          {subs.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                          ))}
                                        </select>
                                      )
                                    })()}
                                  </td>
                                  <td className="py-1 text-right">
                                    {onCategorize && t.merchantName && (
                                      <button
                                        className="text-[10px] text-blue-600 hover:underline"
                                        onClick={() => onCategorize(t.merchantName)}
                                        title="Open bulk categorize for this merchant"
                                      >
                                        bulk
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {sortedCategoryTxns.length === 0 && (
                                <tr><td colSpan={7} className="text-muted-foreground py-2">No transactions</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
