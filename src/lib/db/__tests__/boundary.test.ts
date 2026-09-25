import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import drizzleConfig from '../../../../drizzle.config'

/**
 * The hub/boctor-financials boundary on the shared Neon database (P3 AC-006).
 *
 * boctor-financials owns the financial tables outright (36 tables as of its v0.39.1).
 * The hub must neither define them nor let drizzle-kit see them: an unfiltered
 * `drizzle-kit push` from here would offer to drop every table the hub schema does
 * not define — the family's live financial and tax data.
 *
 * See docs/features/2026-09-25-hub-financials-decoupling-p3.md
 */

/** Tables boctor-financials took over from the hub in the extraction. */
const MOVED_TO_BOCTOR_FINANCIALS = [
  'financial_categories', 'financial_subcategories', 'financial_entities',
  'financial_accounts', 'financial_statements', 'financial_transactions',
  'transaction_splits', 'financial_assumptions', 'parse_errors', 'ato_codes',
  'invoice_tags', 'export_jobs', 'invoice_suppliers', 'invoices',
]

/** The hub's own tables. A new hub table must be added here deliberately. */
const HUB_OWNED = [
  'accounts', 'ai_feedback', 'ai_skill_versions', 'app_settings', 'comments',
  'emails_scanned', 'gmail_accounts', 'notion_dedupe_reports', 'profiles',
  'scan_runs', 'sessions', 'subtasks', 'tasks', 'topics', 'verification_tokens',
  'whatsapp_digest_snapshots', 'whatsapp_outbound_messages', 'whatsapp_processed_messages',
]

/** True if `src` defines table `name` via pgTable(), whatever quote style is used. */
function definesTable(src: string, name: string): boolean {
  return new RegExp(String.raw`pgTable\(\s*['"` + '`' + String.raw`]${name}['"` + '`' + ']').test(src)
}

describe('hub / boctor-financials boundary', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/db/schema.ts'), 'utf8')

  it('defines none of the tables boctor-financials owns', () => {
    const defined = MOVED_TO_BOCTOR_FINANCIALS.filter((t) => definesTable(src, t))
    expect(defined).toEqual([])
  })

  it('the definition check sees every quote style', () => {
    expect(definesTable("pgTable('invoices', {", 'invoices')).toBe(true)
    expect(definesTable('pgTable("invoices", {', 'invoices')).toBe(true)
    expect(definesTable('pgTable(`invoices`, {', 'invoices')).toBe(true)
    expect(definesTable("pgTable('invoices_archive', {", 'invoices')).toBe(false)
  })

  it('drizzle-kit is filtered to exactly the hub-owned tables', () => {
    const filter = drizzleConfig.tablesFilter
    expect(Array.isArray(filter)).toBe(true)
    expect([...(filter as string[])].sort()).toEqual([...HUB_OWNED].sort())
  })

  it('the filter can never include a boctor-financials table', () => {
    const filter = drizzleConfig.tablesFilter as string[]
    expect(filter.filter((t) => MOVED_TO_BOCTOR_FINANCIALS.includes(t))).toEqual([])
  })
})
