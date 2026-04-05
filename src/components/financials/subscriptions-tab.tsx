'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AlertTriangle, Repeat } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

interface Subscription {
  merchant_name: string
  account_name: string
  account_id: string
  amount: number
  frequency: string
  estimated_annual_cost: number
  last_charged: string
  occurrence_count: number
  is_duplicate_across_accounts: boolean
}

interface SubsData {
  subscriptions: Subscription[]
  total_monthly: number
  total_annual: number
}

const formatAUD = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v)

const freqLabel = (f: string) => {
  switch (f) {
    case 'weekly': return 'Weekly'
    case 'monthly': return 'Monthly'
    case 'annual': return 'Annual'
    default: return f
  }
}

export function SubscriptionsTab() {
  const [data, setData] = useState<SubsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/financials/subscriptions')
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
  if (!data || data.subscriptions.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        title="No subscriptions detected yet"
        description="Import more statements or flag transactions as recurring to populate this view."
      />
    )
  }

  const duplicates = data.subscriptions.filter((s) => s.is_duplicate_across_accounts)

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-2xl font-bold text-gray-800">{data.subscriptions.length}</p>
          <p className="text-xs text-muted-foreground">Subscriptions</p>
        </div>
        <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5 text-center">
          <p className="text-2xl font-bold text-blue-700">{formatAUD(data.total_monthly)}</p>
          <p className="text-xs text-blue-600">Per Month</p>
        </div>
        <div className="bg-violet-50 rounded-2xl border border-violet-100 p-5 text-center">
          <p className="text-2xl font-bold text-violet-700">{formatAUD(data.total_annual)}</p>
          <p className="text-xs text-violet-600">Per Year</p>
        </div>
      </div>

      {/* Duplicate warning */}
      {duplicates.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800">
            {duplicates.length} subscription{duplicates.length > 1 ? 's' : ''} found on multiple accounts — possible duplicates.
          </span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Merchant</TableHead>
              <TableHead className="text-xs">Account</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs text-center">Frequency</TableHead>
              <TableHead className="text-xs text-right">Est. Annual</TableHead>
              <TableHead className="text-xs text-center">Last Charged</TableHead>
              <TableHead className="text-xs text-center">Charges</TableHead>
              <TableHead className="text-xs text-center">Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.subscriptions.map((sub, i) => (
              <TableRow key={i} className={sub.is_duplicate_across_accounts ? 'bg-amber-50/30' : ''}>
                <TableCell className="text-xs font-medium">{sub.merchant_name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{sub.account_name}</TableCell>
                <TableCell className="text-xs text-right font-medium">{formatAUD(sub.amount)}</TableCell>
                <TableCell className="text-xs text-center">
                  <Badge variant="secondary" className="text-[10px]">{freqLabel(sub.frequency)}</Badge>
                </TableCell>
                <TableCell className="text-xs text-right">{formatAUD(sub.estimated_annual_cost)}</TableCell>
                <TableCell className="text-xs text-center text-muted-foreground">{sub.last_charged}</TableCell>
                <TableCell className="text-xs text-center text-muted-foreground">{sub.occurrence_count}</TableCell>
                <TableCell className="text-xs text-center">
                  {sub.is_duplicate_across_accounts && (
                    <Badge className="bg-amber-100 text-amber-700 text-[10px]">Duplicate?</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
