const money = (n: number) => {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}$${abs}`
}

export type SpendPayload = {
  monthLabel: string
  total: number
  topCategories: { name: string; amount: number }[]
}

export function formatSpend(p: SpendPayload): string {
  const lines = [`*Spend — ${p.monthLabel}*`, `Total: ${money(p.total)}`, '']
  if (p.topCategories.length === 0) {
    lines.push('No category data for this month.')
  } else {
    lines.push('Top categories:')
    for (const c of p.topCategories) lines.push(`• ${c.name}  ${money(c.amount)}`)
  }
  return lines.join('\n')
}

export function formatBalance(rows: { label: string; balance: number }[]): string {
  if (rows.length === 0) return '*Balances*\nNo accounts found.'
  const lines = ['*Balances*']
  for (const r of rows) lines.push(`• ${r.label}  ${money(r.balance)}`)
  return lines.join('\n')
}

export function formatRecent(
  rows: { date: string; amount: number; merchant: string; category: string | null }[],
): string {
  if (rows.length === 0) return '*Recent 5*\nNo recent transactions.'
  const lines = ['*Recent 5*']
  for (const r of rows) {
    lines.push(`${r.date}  ${money(r.amount)}  ${r.merchant}  ${r.category ?? ''}`.trimEnd())
  }
  return lines.join('\n')
}
