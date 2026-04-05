'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface EntitySummary {
  id: string
  name: string
  type: 'personal' | 'business' | 'trust'
  transactionCount: number
  totalIncome: number
  totalExpenses: number
  totalDeductible: number
  unreviewedCount: number
  outstandingCount: number
}

interface OverviewResponse {
  entities: EntitySummary[]
  fy: string
}

const formatAUD = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v)

export function OverviewTab({ fy }: { fy: string }) {
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/financials/tax/overview?fy=${fy}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [fy])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading {fy} overview…
      </div>
    )
  }

  if (!data || data.entities.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No data for {fy}. Import statements via{' '}
        <Link href="/financials/import" className="text-blue-600 underline">
          /financials/import
        </Link>{' '}
        first.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.entities.map((entity) => (
          <EntityCard key={entity.id} entity={entity} />
        ))}
      </div>
    </div>
  )
}

function EntityCard({ entity }: { entity: EntitySummary }) {
  const hasIssues = entity.unreviewedCount > 0 || entity.outstandingCount > 0
  const typeColor =
    entity.type === 'personal'
      ? 'bg-blue-50 text-blue-700'
      : entity.type === 'business'
      ? 'bg-purple-50 text-purple-700'
      : 'bg-amber-50 text-amber-700'

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{entity.name}</h3>
          <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded mt-1 ${typeColor}`}>
            {entity.type}
          </span>
        </div>
        {hasIssues ? (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Income</p>
          <p className="text-sm font-semibold text-green-700">{formatAUD(entity.totalIncome)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Expenses</p>
          <p className="text-sm font-semibold text-gray-900">{formatAUD(entity.totalExpenses)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Deductible</p>
          <p className="text-sm font-semibold text-amber-700">{formatAUD(entity.totalDeductible)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Txns</p>
          <p className="text-sm font-semibold">{entity.transactionCount}</p>
        </div>
      </div>

      {hasIssues && (
        <div className="pt-2 border-t border-gray-100 space-y-1">
          {entity.unreviewedCount > 0 && (
            <Link
              href="/financials/categorize"
              className="flex items-center justify-between text-xs text-amber-700 hover:text-amber-800"
            >
              <span>{entity.unreviewedCount} unreviewed ATO codes</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          {entity.outstandingCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {entity.outstandingCount} outstanding item{entity.outstandingCount > 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
