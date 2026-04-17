/**
 * Dedupe financial transactions across overlapping imports.
 *
 * Pass 1 (intra-account): find rows with identical (account_id, transaction_date, amount, description_raw)
 *   and collapse to one. Winner preference: fingerprint starts with 'fitid:' (bank-authoritative), else keep
 *   earliest createdAt.
 * Pass 2 (cross-account flag): report rows with same (transaction_date, amount, description_raw) spread
 *   across multiple accounts — needs human review, don't auto-delete.
 *
 * Default: DRY RUN. Pass --apply to actually delete.
 */
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)

const APPLY = process.argv.includes('--apply')

async function run() {
  console.log(`Mode: ${APPLY ? 'APPLY (will delete)' : 'DRY RUN (no changes)'}\n`)

  // ---------- Pass 1: intra-account exact dupes ----------
  console.log('Pass 1 — intra-account content duplicates')
  const intraGroups = (await sql`
    SELECT
      account_id,
      transaction_date,
      amount,
      description_raw,
      count(*)::int AS n,
      array_agg(id ORDER BY (fingerprint LIKE 'fitid:%') DESC, created_at ASC) AS ids,
      array_agg(fingerprint ORDER BY (fingerprint LIKE 'fitid:%') DESC, created_at ASC) AS fingerprints
    FROM financial_transactions
    GROUP BY account_id, transaction_date, amount, description_raw
    HAVING count(*) > 1
  `) as any[]

  const totalExtraRows = intraGroups.reduce((s, g) => s + (g.n - 1), 0)
  console.log(`  Found ${intraGroups.length} duplicate groups covering ${totalExtraRows} removable rows`)

  // Breakdown by category
  const idsToDelete: string[] = []
  for (const g of intraGroups) {
    // Keep ids[0] (preferred), delete the rest
    for (let i = 1; i < g.ids.length; i++) idsToDelete.push(g.ids[i])
  }

  if (idsToDelete.length > 0) {
    const categoryCounts = (await sql`
      SELECT
        coalesce(nullif(category, 'OTHER'), ai_suggested_category, 'OTHER') AS cat,
        count(*)::int AS n,
        sum(abs(amount::numeric))::numeric(14,2) AS total
      FROM financial_transactions
      WHERE id = ANY(${idsToDelete}::uuid[])
      GROUP BY cat
      ORDER BY n DESC
    `) as any[]

    console.log('\n  Breakdown by category (rows that would be deleted):')
    console.table(categoryCounts)
  }

  // ---------- Pass 2: cross-account identical rows (FLAG ONLY) ----------
  console.log('\nPass 2 — cross-account identical rows (needs review, NOT auto-deleted)')
  const crossRows = (await sql`
    SELECT
      transaction_date,
      amount,
      description_raw,
      count(DISTINCT account_id)::int AS account_count,
      count(*)::int AS row_count,
      array_agg(DISTINCT account_id::text) AS account_ids
    FROM financial_transactions
    GROUP BY transaction_date, amount, description_raw
    HAVING count(DISTINCT account_id) > 1
  `) as any[]
  console.log(`  Found ${crossRows.length} distinct (date+amount+description) combos spanning 2+ accounts`)
  console.log(`  Total rows involved: ${crossRows.reduce((s, r) => s + r.row_count, 0)}`)

  if (crossRows.length > 0) {
    const sample = crossRows.slice(0, 10).map((r) => ({
      date: r.transaction_date,
      amount: r.amount,
      description: String(r.description_raw).slice(0, 50),
      accounts: r.account_count,
      rows: r.row_count,
    }))
    console.log('\n  Sample (first 10):')
    console.table(sample)
  }

  // ---------- Apply ----------
  if (!APPLY) {
    console.log(`\nDry run complete. Rerun with --apply to delete ${idsToDelete.length} rows from Pass 1.`)
    console.log('Pass 2 (cross-account) is never auto-deleted — review manually.')
    return
  }

  console.log(`\nDeleting ${idsToDelete.length} rows from Pass 1...`)
  let done = 0
  const BATCH = 200
  for (let i = 0; i < idsToDelete.length; i += BATCH) {
    const batch = idsToDelete.slice(i, i + BATCH)
    await sql`DELETE FROM financial_transactions WHERE id = ANY(${batch}::uuid[])`
    done += batch.length
    process.stdout.write(`\r  deleted ${done}/${idsToDelete.length}`)
  }
  process.stdout.write('\n')
  console.log('Done.')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
