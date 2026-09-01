import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AC-005 — no foreign key may cross from the financials cluster to the hub cluster.
 * Guards the extraction boundary at the source level: if someone adds a
 * `references(() => profiles.id)` to a financials table, this fails.
 *
 * See docs/features/2026-08-31-boctor-financials-extraction.md
 */
const FINANCIALS_TABLES = [
  'financialCategories', 'financialSubcategories', 'financialEntities',
  'financialAccounts', 'financialStatements', 'financialTransactions',
  'transactionSplits', 'financialAssumptions', 'parseErrors', 'atoCodes',
  'invoiceTags', 'exportJobs', 'invoiceSuppliers', 'invoices',
]

const HUB_TABLES = ['profiles', 'tasks', 'emailsScanned', 'gmailAccounts', 'appSettings']

function blockFor(src: string, table: string): string {
  const start = src.indexOf(`export const ${table} = pgTable(`)
  if (start === -1) throw new Error(`table ${table} not found in schema.ts`)
  const end = src.indexOf('\nexport const ', start + 1)
  return src.slice(start, end === -1 ? src.length : end)
}

describe('extraction boundary', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/db/schema.ts'), 'utf8')

  it('declares every financials table', () => {
    for (const t of FINANCIALS_TABLES) {
      expect(src).toContain(`export const ${t} = pgTable(`)
    }
  })

  it('has no financials table referencing a hub table', () => {
    const violations: string[] = []
    for (const table of FINANCIALS_TABLES) {
      const block = blockFor(src, table)
      for (const hub of HUB_TABLES) {
        if (block.includes(`=> ${hub}.`)) violations.push(`${table} -> ${hub}`)
      }
    }
    expect(violations).toEqual([])
  })
})
