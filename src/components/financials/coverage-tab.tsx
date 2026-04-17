'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Calendar, ChevronRight, ChevronDown } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

interface CoverageMonth {
  month: string
  status: 'imported' | 'missing' | 'needs_review' | 'future'
  has_duplicates?: boolean
}

interface StatementCoverage {
  id: string
  file_name: string
  source_type: string | null
  statement_start: string | null
  statement_end: string | null
  imported_at: string | null
  needs_review: boolean
  months: CoverageMonth[]
}

interface AccountCoverage {
  account_id: string
  bank_name: string
  account_name: string
  account_number_last4: string
  account_type: string
  months: CoverageMonth[]
  statements?: StatementCoverage[]
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

// Australian FY: Jul–Jun. Startyear 2025 → "FY26" (ends Jun 2026).
const fyLabel = (startYear: number) => `FY${String((startYear + 1) % 100).padStart(2, '0')}`

interface FyGroup {
  label: string
  startYear: number
  months: string[]
}

function groupMonthsByFy(months: string[]): FyGroup[] {
  const groups: FyGroup[] = []
  let current: FyGroup | null = null
  for (const month of months) {
    const [y, m] = month.split('-').map(Number)
    const startYear = m >= 7 ? y : y - 1
    if (!current || current.startYear !== startYear) {
      current = { startYear, label: fyLabel(startYear), months: [] }
      groups.push(current)
    }
    current.months.push(month)
  }
  return groups
}

export function CoverageTab() {
  const [data, setData] = useState<CoverageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (accountId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
  }

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
      <div className="flex items-center gap-4 text-xs flex-wrap">
        {Object.entries(statusColors).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${color}`} />
            <span className="text-muted-foreground">{statusLabels[status]}</span>
          </div>
        ))}
        <span className="mx-2 h-4 w-px bg-gray-200" />
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-500 ring-2 ring-rose-500 ring-offset-1" />
          <span className="text-muted-foreground">Overlap + dupes</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-500 ring-2 ring-blue-500 ring-offset-1" />
          <span className="text-muted-foreground">Overlap, cleaned</span>
        </div>
      </div>

      {/* Coverage grid — FY-grouped headers */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        {(() => {
          const fyGroups = groupMonthsByFy(data.months)
          return (
            <table className="w-full border-collapse">
              <thead>
                {/* FY header row */}
                <tr>
                  <th
                    rowSpan={2}
                    className="text-xs font-medium text-left text-muted-foreground pb-3 pr-4 sticky left-0 bg-white min-w-[180px] align-bottom"
                  >
                    Account
                  </th>
                  {fyGroups.map((fy, gi) => (
                    <th
                      key={fy.label}
                      colSpan={fy.months.length}
                      className={`text-xs font-semibold text-center text-gray-700 pb-1 px-1 ${
                        gi > 0 ? 'border-l-2 border-gray-300' : ''
                      }`}
                    >
                      {fy.label}
                      <span className="text-[10px] font-normal text-muted-foreground ml-1">
                        (Jul {fy.startYear}–Jun {fy.startYear + 1})
                      </span>
                    </th>
                  ))}
                </tr>
                {/* Month letter row */}
                <tr>
                  {fyGroups.flatMap((fy, gi) =>
                    fy.months.map((month, mi) => (
                      <th
                        key={month}
                        className={`text-[10px] text-center text-muted-foreground pb-3 px-0.5 min-w-[22px] ${
                          gi > 0 && mi === 0 ? 'border-l-2 border-gray-300' : ''
                        }`}
                      >
                        {formatMonthLabel(month)}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <TooltipProvider>
                <tbody>
                  {data.coverage.flatMap((acc) => {
                    const byMonth = new Map(acc.months.map((m) => [m.month, m]))
                    const isOpen = expanded.has(acc.account_id)
                    const stmts = acc.statements ?? []
                    // Count per-month overlaps across this account's statements
                    const monthStmtCount = new Map<string, number>()
                    for (const s of stmts) {
                      for (const m of s.months) {
                        if (m.status === 'imported' || m.status === 'needs_review') {
                          monthStmtCount.set(m.month, (monthStmtCount.get(m.month) ?? 0) + 1)
                        }
                      }
                    }

                    const rows: any[] = [
                      <tr key={acc.account_id} className="border-t border-gray-100">
                        <td className="text-xs py-1.5 pr-4 sticky left-0 bg-white">
                          <button
                            className="flex items-start gap-1.5 w-full text-left"
                            onClick={() => toggleExpand(acc.account_id)}
                            disabled={stmts.length === 0}
                          >
                            {stmts.length > 0 ? (
                              isOpen ? <ChevronDown className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                                     : <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                            ) : <span className="w-3 h-3 shrink-0" />}
                            <div className="flex-1">
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
                              {stmts.length > 0 && (
                                <span className="text-[10px] text-muted-foreground ml-2">· {stmts.length} stmt{stmts.length === 1 ? '' : 's'}</span>
                              )}
                            </div>
                          </button>
                        </td>
                        {fyGroups.flatMap((fy, gi) =>
                          fy.months.map((month, mi) => {
                            const m = byMonth.get(month) || { month, status: 'missing' as const, has_duplicates: false }
                            const overlap = (monthStmtCount.get(month) ?? 0) > 1
                            const hasDupes = !!(m as any).has_duplicates
                            const ringClass = overlap
                              ? hasDupes
                                ? 'ring-2 ring-rose-500 ring-offset-1'
                                : 'ring-2 ring-blue-500 ring-offset-1'
                              : ''
                            return (
                              <td
                                key={month}
                                className={`py-1.5 px-0.5 text-center ${
                                  gi > 0 && mi === 0 ? 'border-l-2 border-gray-300' : ''
                                }`}
                              >
                                <Tooltip>
                                  <TooltipTrigger>
                                    <div className={`w-4 h-4 rounded-sm mx-auto ${statusColors[m.status]} ${ringClass}`} />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">
                                      {formatMonthFull(m.month)}: {statusLabels[m.status]}
                                      {overlap && (
                                        <span className={`block ${hasDupes ? 'text-rose-300' : 'text-blue-300'}`}>
                                          {hasDupes
                                            ? `⚠ ${monthStmtCount.get(month)} overlapping statements + duplicate transactions`
                                            : `ⓘ ${monthStmtCount.get(month)} overlapping statements (no duplicate transactions — cleaned)`}
                                        </span>
                                      )}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                            )
                          }),
                        )}
                      </tr>,
                    ]

                    if (isOpen) {
                      stmts.forEach((s) => {
                        const smByMonth = new Map(s.months.map((m) => [m.month, m]))
                        rows.push(
                          <tr key={`${acc.account_id}-${s.id}`} className="bg-gray-50/50">
                            <td className="text-[10px] py-1 pr-4 pl-8 sticky left-0 bg-gray-50/50">
                              <div className="truncate max-w-[320px]" title={s.file_name}>
                                <span className="font-mono text-muted-foreground">{s.source_type?.toUpperCase() || '—'}</span>{' '}
                                <span className="text-gray-700">{s.file_name}</span>
                              </div>
                              <span className="text-muted-foreground">
                                {s.statement_start?.slice(0, 10)} → {s.statement_end?.slice(0, 10)}
                              </span>
                            </td>
                            {fyGroups.flatMap((fy, gi) =>
                              fy.months.map((month, mi) => {
                                const m = smByMonth.get(month) || { month, status: 'missing' as const }
                                return (
                                  <td
                                    key={month}
                                    className={`py-1 px-0.5 text-center ${
                                      gi > 0 && mi === 0 ? 'border-l-2 border-gray-300' : ''
                                    }`}
                                  >
                                    {m.status !== 'missing' && m.status !== 'future' ? (
                                      <div className={`w-2.5 h-2.5 rounded-sm mx-auto ${statusColors[m.status]}`} />
                                    ) : (
                                      <div className="w-2.5 h-2.5 mx-auto" />
                                    )}
                                  </td>
                                )
                              }),
                            )}
                          </tr>
                        )
                      })
                    }

                    return rows
                  })}
                </tbody>
              </TooltipProvider>
            </table>
          )
        })()}
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
