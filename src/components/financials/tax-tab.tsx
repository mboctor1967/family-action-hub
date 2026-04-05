'use client'

import { useEffect, useState } from 'react'
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
import { StatCard } from './stat-card'
import { Download, Briefcase, Heart, TrendingUp, DollarSign, FileText } from 'lucide-react'

interface TaxData {
  financial_year: string
  period: { from: string; to: string }
  summary: {
    work_expenses: number
    donations: number
    investment: number
    total: number
  }
  by_category: Array<{
    taxCategory: string
    total: number
    count: number
  }>
  transactions: Array<{
    id: string
    transactionDate: string
    descriptionRaw: string
    merchantName: string
    amount: string
    category: string
    taxCategory: string
  }>
}

const formatAUD = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v)

const taxCategoryLabel = (tc: string) => {
  switch (tc) {
    case 'work_expense': return 'Work Expense'
    case 'donation': return 'Donation'
    case 'investment': return 'Investment'
    default: return tc
  }
}

const taxCategoryColor = (tc: string) => {
  switch (tc) {
    case 'work_expense': return 'bg-blue-100 text-blue-700'
    case 'donation': return 'bg-pink-100 text-pink-700'
    case 'investment': return 'bg-green-100 text-green-700'
    default: return ''
  }
}

export function TaxTab() {
  // Default to current Australian FY (Jul-Jun). If we're before Jul, use previous year
  const now = new Date()
  const defaultFY = now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear()
  const [fy, setFY] = useState(String(defaultFY))
  const [data, setData] = useState<TaxData | null>(null)
  const [loading, setLoading] = useState(true)

  function loadData(fyYear: string) {
    setLoading(true)
    fetch(`/api/financials/tax?fy=${fyYear}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData(fy) }, [fy])

  // Generate FY options: last 5 years
  const fyOptions = Array.from({ length: 5 }, (_, i) => {
    const y = now.getFullYear() - i
    return { value: String(y), label: `FY${y}/${y + 1}` }
  })

  function handleExport() {
    window.open(`/api/financials/export?fy=${fy}`, '_blank')
  }

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>

  return (
    <div className="space-y-6">
      {/* FY selector + export */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-3">
        <span className="text-xs font-medium text-muted-foreground">Financial Year:</span>
        <Select value={fy} onValueChange={(v) => v && setFY(v)}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fyOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-2">
          ({data?.period.from} to {data?.period.to})
        </span>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5 h-8 text-xs" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Work Expenses"
            value={formatAUD(data.summary.work_expenses)}
            icon={Briefcase}
            iconColor="bg-blue-600"
          />
          <StatCard
            label="Donations"
            value={formatAUD(data.summary.donations)}
            icon={Heart}
            iconColor="bg-pink-600"
          />
          <StatCard
            label="Investment"
            value={formatAUD(data.summary.investment)}
            icon={TrendingUp}
            iconColor="bg-green-600"
          />
          <StatCard
            label="Total Deductible"
            value={formatAUD(data.summary.total)}
            icon={DollarSign}
            iconColor="bg-violet-600"
            helper={data.financial_year}
          />
        </div>
      )}

      {/* Transactions table */}
      {data && data.transactions.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Tax-Deductible Transactions ({data.transactions.length})
            </h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs">Merchant</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
                <TableHead className="text-xs text-center">Category</TableHead>
                <TableHead className="text-xs text-center">Tax Category</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs text-muted-foreground">{t.transactionDate}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{t.descriptionRaw}</TableCell>
                  <TableCell className="text-xs">{t.merchantName || '—'}</TableCell>
                  <TableCell className="text-xs text-right font-medium">
                    {formatAUD(Math.abs(Number(t.amount)))}
                  </TableCell>
                  <TableCell className="text-xs text-center">
                    <Badge variant="secondary" className="text-[10px]">{t.category || '—'}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-center">
                    {t.taxCategory ? (
                      <Badge className={`text-[10px] ${taxCategoryColor(t.taxCategory)}`}>
                        {taxCategoryLabel(t.taxCategory)}
                      </Badge>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : data ? (
        <div className="text-center py-12 space-y-2 bg-white rounded-xl border border-gray-100 shadow-sm">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">No tax-deductible transactions found for {data.financial_year}.</p>
          <p className="text-sm text-muted-foreground">
            Transactions are flagged as tax-deductible during AI parsing of PDF statements.
          </p>
        </div>
      ) : null}
    </div>
  )
}
