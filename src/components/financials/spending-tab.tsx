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
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Tag } from 'lucide-react'

interface SpendingCategory {
  category: string
  amount: number
  percentage: number
  transaction_count: number
  vs_prior_period: number | null
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

export function SpendingTab({ filter, filterKey, onCategorize }: { filter: FilterState; filterKey: number; onCategorize?: (search?: string) => void }) {
  const [data, setData] = useState<SpendingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [categoryTxns, setCategoryTxns] = useState<any[]>([])
  const [loadingTxns, setLoadingTxns] = useState(false)

  // Date range — use filter dates or default to current Australian FY
  const now = new Date()
  const defaultFYStart = now.getMonth() >= 6 ? `${now.getFullYear()}-07-01` : `${now.getFullYear() - 1}-07-01`
  const [fromDate, setFromDate] = useState(defaultFYStart)
  const [toDate, setToDate] = useState(now.toISOString().slice(0, 10))

  function loadData(from: string, to: string) {
    setLoading(true)
    const params = new URLSearchParams({ from, to })
    if (filter.accountIds.length > 0) params.set('account_ids', filter.accountIds.join(','))
    if (filter.entityIds.length > 0) params.set('entity_ids', filter.entityIds.join(','))
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
    try {
      const res = await fetch(`/api/financials/transactions?category=${encodeURIComponent(category)}&from=${fromDate}&to=${toDate}&limit=50`)
      if (res.ok) {
        const d = await res.json()
        setCategoryTxns(d.transactions || [])
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
      {/* Date range */}
      <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <span className="text-xs font-medium text-muted-foreground">Period:</span>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-36 text-xs" />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 w-36 text-xs" />
        <Button size="sm" className="h-8 text-xs" onClick={handleApply}>Apply</Button>
        <span className="ml-auto text-sm font-semibold">{formatAUD(data.total_spending)} total</span>
      </div>

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
              <TableHead className="text-xs">Category</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs text-center">% of Total</TableHead>
              <TableHead className="text-xs text-center">Transactions</TableHead>
              <TableHead className="text-xs text-center">vs Prior Period</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.categories.map((cat, idx) => (
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
                        <div className="px-8 py-2 space-y-1">
                          {categoryTxns.map((t: any) => (
                            <div key={t.id} className="flex items-center gap-3 text-xs py-1 border-b border-gray-100 last:border-0">
                              <span className="text-muted-foreground w-20">{t.transactionDate}</span>
                              <span className="flex-1 truncate">{t.merchantName || t.descriptionRaw}</span>
                              <span className="font-medium">{formatAUD(Math.abs(Number(t.amount)))}</span>
                              {onCategorize && t.merchantName && (
                                <button
                                  className="text-[10px] text-blue-600 hover:underline shrink-0"
                                  onClick={() => onCategorize(t.merchantName)}
                                >
                                  edit
                                </button>
                              )}
                            </div>
                          ))}
                          {categoryTxns.length === 0 && (
                            <p className="text-xs text-muted-foreground py-2">No transactions</p>
                          )}
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
