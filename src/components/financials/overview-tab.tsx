'use client'

import { useEffect, useState } from 'react'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { type FilterState } from './account-filter'
import { IncomeExpenseChart } from './charts/income-expense-chart'
import { TrendingUp, TrendingDown, DollarSign, Percent, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface SummaryData {
  monthly: Array<{
    month: string
    income: number
    expenses: number
    net: number
    savings_rate: number
  }>
  accounts: Array<{
    accountId: string
    bankName: string
    accountName: string
    accountNumberLast4: string
    accountType: string
    owner: string
    closingBalance: string | null
    statementEnd: string | null
  }>
  totals: {
    statements: number
    needs_review: number
  }
}

const formatAUD = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)

export function OverviewTab({ filter, filterKey }: { filter: FilterState; filterKey: number }) {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ months: filter.from ? '60' : '12' })
    if (filter.accountIds.length > 0) params.set('account_ids', filter.accountIds.join(','))
    if (filter.entityIds.length > 0) params.set('entity_ids', filter.entityIds.join(','))
    if (filter.from) params.set('from', filter.from)
    if (filter.to) params.set('to', filter.to)
    fetch(`/api/financials/summary?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterKey, filter])

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
  }

  if (!data || data.totals.statements === 0) {
    return (
      <EmptyState
        icon={DollarSign}
        title="No financial data yet"
        description="Import bank statements to see your overview."
      />
    )
  }

  // Current month stats (last entry)
  const current = data.monthly[data.monthly.length - 1]
  const income = current?.income || 0
  const expenses = current?.expenses || 0
  const net = current?.net || 0
  const savingsRate = current?.savings_rate || 0

  return (
    <div className="space-y-6">
      {/* Alert banner */}
      {data.totals.needs_review > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800">
            {data.totals.needs_review} statement{data.totals.needs_review > 1 ? 's' : ''} need{data.totals.needs_review === 1 ? 's' : ''} review
          </span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Income"
          value={formatAUD(income)}
          icon={TrendingUp}
          iconColor="text-green-600"
          iconBg="bg-green-50"
          helper={current?.month}
        />
        <StatCard
          label="Expenses"
          value={formatAUD(expenses)}
          icon={TrendingDown}
          iconColor="text-red-600"
          iconBg="bg-red-50"
          helper={current?.month}
        />
        <StatCard
          label="Net Savings"
          value={formatAUD(net)}
          icon={DollarSign}
          iconColor={net >= 0 ? 'text-blue-600' : 'text-red-600'}
          iconBg={net >= 0 ? 'bg-blue-50' : 'bg-red-50'}
          helper={current?.month}
        />
        <StatCard
          label="Savings Rate"
          value={`${savingsRate}%`}
          icon={Percent}
          iconColor="text-violet-600"
          iconBg="bg-violet-50"
          helper={current?.month}
        />
      </div>

      {/* Income vs Expenses chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Income vs Expenses (Last 12 Months)</h3>
        <IncomeExpenseChart data={data.monthly} />
      </div>

      {/* Account balances */}
      {data.accounts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Account Balances</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.accounts.map((acc) => (
              <div
                key={acc.accountId}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">{acc.bankName}</span>
                  {acc.accountType && (
                    <Badge variant="secondary" className="text-[10px]">
                      {acc.accountType.replace('_', ' ')}
                    </Badge>
                  )}
                </div>
                <p className="text-sm font-medium">{acc.accountName || `••${acc.accountNumberLast4}`}</p>
                <p className="text-xl font-bold mt-1">
                  {acc.closingBalance ? formatAUD(Number(acc.closingBalance)) : '—'}
                </p>
                {acc.statementEnd && (
                  <p className="text-xs text-gray-400 mt-1">
                    Last statement: {acc.statementEnd}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals summary */}
      <div className="text-xs text-muted-foreground text-center">
        {data.totals.statements} statements imported
      </div>
    </div>
  )
}
