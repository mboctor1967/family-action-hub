'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface MonthlyData {
  month: string
  income: number
  expenses: number
  net: number
}

interface IncomeExpenseChartProps {
  data: MonthlyData[]
}

const formatCurrency = (value: number) => {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

const formatMonth = (month: string) => {
  const [, m] = month.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months[parseInt(m, 10) - 1] || m
}

export function IncomeExpenseChart({ data }: IncomeExpenseChartProps) {
  if (!data.length) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No data yet. Import statements to see charts.
      </div>
    )
  }

  const chartData = data.map((d) => ({
    ...d,
    month: formatMonth(d.month),
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value) => [`$${Number(value).toFixed(2)}`, '']}
          labelStyle={{ fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
