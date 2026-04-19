import { describe, it, expect } from 'vitest'
import { formatSpend, formatBalance, formatRecent } from '../formatters'

describe('formatSpend', () => {
  it('renders total and top 3 categories', () => {
    const out = formatSpend({
      monthLabel: 'April 2026',
      total: 3247.18,
      topCategories: [
        { name: 'Groceries', amount: 842.10 },
        { name: 'Fuel', amount: 310.55 },
        { name: 'Dining', amount: 198.00 },
      ],
    })
    expect(out).toContain('*Spend — April 2026*')
    expect(out).toContain('Total: $3,247.18')
    expect(out).toContain('Groceries')
    expect(out).toContain('$842.10')
  })
  it('handles empty categories', () => {
    const out = formatSpend({ monthLabel: 'April 2026', total: 0, topCategories: [] })
    expect(out).toContain('Total: $0.00')
  })
})

describe('formatBalance', () => {
  it('renders one line per account with signed amount', () => {
    const out = formatBalance([
      { label: 'CBA Everyday', balance: 4120.33 },
      { label: 'AMEX Platinum', balance: -1204.88 },
    ])
    expect(out).toContain('*Balances*')
    expect(out).toContain('CBA Everyday')
    expect(out).toContain('$4,120.33')
    expect(out).toContain('-$1,204.88')
  })
  it('handles no accounts', () => {
    expect(formatBalance([])).toContain('No accounts')
  })
})

describe('formatRecent', () => {
  it('renders up to 5 transactions', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-04-${10 + i}`,
      amount: -10 * (i + 1),
      merchant: `M${i}`,
      category: `C${i}`,
    }))
    const out = formatRecent(rows)
    expect(out).toContain('*Recent 5*')
    expect(out.split('\n').filter((l) => l.includes('M0')).length).toBe(1)
  })
  it('handles empty', () => {
    expect(formatRecent([])).toContain('No recent')
  })
})
