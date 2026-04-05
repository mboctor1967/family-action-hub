'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Calendar } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

interface CoverageMonth {
  month: string
  status: 'imported' | 'missing' | 'needs_review' | 'future'
}

interface AccountCoverage {
  account_id: string
  bank_name: string
  account_name: string
  account_number_last4: string
  account_type: string
  months: CoverageMonth[]
}

interface CoverageData {
  coverage: AccountCoverage[]
  months: string[]
}

const statusColors: Record<string, string> = {
  imported: 'bg-green-500',
  missing: 'bg-red-400',
  needs_review: 'bg-amber-400',
  future: 'bg-gray-200',
}

const statusLabels: Record<string, string> = {
  imported: 'Imported',
  missing: 'Missing',
  needs_review: 'Needs Review',
  future: 'Future',
}

const formatMonthLabel = (month: string) => {
  const [y, m] = month.split('-')
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  return months[parseInt(m, 10) - 1] || m
}

const formatMonthFull = (month: string) => {
  const [y, m] = month.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[parseInt(m, 10) - 1]} ${y}`
}

export function CoverageTab() {
  const [data, setData] = useState<CoverageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/financials/coverage')
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
  if (!data || data.coverage.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No accounts found"
        description="Import statements to see which months have coverage vs gaps."
      />
    )
  }

  // Count missing
  const totalMissing = data.coverage.reduce((sum, acc) =>
    sum + acc.months.filter((m) => m.status === 'missing').length, 0
  )
  const totalReview = data.coverage.reduce((sum, acc) =>
    sum + acc.months.filter((m) => m.status === 'needs_review').length, 0
  )
  const totalImported = data.coverage.reduce((sum, acc) =>
    sum + acc.months.filter((m) => m.status === 'imported').length, 0
  )

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-2xl font-bold text-gray-800">{data.coverage.length}</p>
          <p className="text-xs text-muted-foreground">Accounts</p>
        </div>
        <div className="bg-green-50 rounded-2xl border border-green-100 p-5 text-center">
          <p className="text-2xl font-bold text-green-700">{totalImported}</p>
          <p className="text-xs text-green-600">Months Covered</p>
        </div>
        <div className="bg-red-50 rounded-2xl border border-red-100 p-5 text-center">
          <p className="text-2xl font-bold text-red-600">{totalMissing}</p>
          <p className="text-xs text-red-500">Months Missing</p>
        </div>
        <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5 text-center">
          <p className="text-2xl font-bold text-amber-600">{totalReview}</p>
          <p className="text-xs text-amber-500">Need Review</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        {Object.entries(statusColors).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${color}`} />
            <span className="text-muted-foreground">{statusLabels[status]}</span>
          </div>
        ))}
      </div>

      {/* Coverage grid */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-xs font-medium text-left text-muted-foreground pb-3 pr-4 sticky left-0 bg-white min-w-[150px]">
                Account
              </th>
              {data.months.map((month) => (
                <th key={month} className="text-[10px] text-center text-muted-foreground pb-3 px-0.5 min-w-[20px]">
                  {formatMonthLabel(month)}
                </th>
              ))}
            </tr>
          </thead>
          <TooltipProvider>
            <tbody>
              {data.coverage.map((acc) => (
                <tr key={acc.account_id}>
                  <td className="text-xs py-1.5 pr-4 sticky left-0 bg-white">
                    <div>
                      <span className="font-medium">{acc.bank_name}</span>
                      {acc.account_name && (
                        <span className="text-muted-foreground ml-1">{acc.account_name}</span>
                      )}
                    </div>
                    {acc.account_number_last4 && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        ••{acc.account_number_last4}
                      </span>
                    )}
                  </td>
                  {acc.months.map((m) => (
                    <td key={m.month} className="py-1.5 px-0.5 text-center">
                      <Tooltip>
                        <TooltipTrigger>
                          <div className={`w-4 h-4 rounded-sm mx-auto ${statusColors[m.status]}`} />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{formatMonthFull(m.month)}: {statusLabels[m.status]}</p>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TooltipProvider>
        </table>
      </div>

      {/* Missing statements list */}
      {totalMissing > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Missing Statements</h3>
          <div className="space-y-2">
            {data.coverage.flatMap((acc) =>
              acc.months
                .filter((m) => m.status === 'missing')
                .map((m) => (
                  <div key={`${acc.account_id}-${m.month}`} className="flex items-center gap-3 text-xs py-1 border-b border-gray-50 last:border-0">
                    <div className="w-3 h-3 rounded-sm bg-red-400 shrink-0" />
                    <span className="font-medium">{acc.bank_name}</span>
                    {acc.account_name && <span className="text-muted-foreground">{acc.account_name}</span>}
                    <span className="ml-auto text-muted-foreground">{formatMonthFull(m.month)}</span>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
