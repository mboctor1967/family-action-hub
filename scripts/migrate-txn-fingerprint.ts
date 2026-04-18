/**
 * Adds financial_transactions.fingerprint column, backfills for existing rows,
 * and swaps the unique dedup index.
 *
 * Idempotent: safe to run multiple times.
 */
import { createHash } from 'node:crypto'
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)

async function run() {
  console.log('1/5 Adding fingerprint column (if missing)...')
  await sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS fingerprint text`

  console.log('2/5 Backfilling fingerprints for rows where it is null...')
  const rows = await sql`
    SELECT id, account_id, transaction_date, amount, description_raw, row_index
    FROM financial_transactions
    WHERE fingerprint IS NULL
  ` as any[]
  console.log(`   ${rows.length} rows to backfill`)

  let done = 0
  const BATCH = 200
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const updates = batch.map((r) => {
      const content = `${r.transaction_date}|${r.amount}|${(r.description_raw || '').trim()}`
      const nth = Number(r.row_index ?? 0) + 1 // stable per existing row
      const fp = `hash:${createHash('sha256').update(`${content}|${nth}`).digest('hex').slice(0, 32)}`
      return { id: r.id, fp }
    })
    // Apply batch
    for (const u of updates) {
      await sql`UPDATE financial_transactions SET fingerprint = ${u.fp} WHERE id = ${u.id}`
    }
    done += batch.length
    if (done % 1000 === 0 || done === rows.length) process.stdout.write(`\r   ${done}/${rows.length}`)
  }
  if (rows.length) process.stdout.write('\n')

  console.log('3/5 Handling any collisions from backfill (keep first, suffix the rest)...')
  // In practice collisions shouldn't exist given the old unique index included row_index,
  // but defensively disambiguate any that do.
  const collisions = await sql`
    SELECT account_id, fingerprint, array_agg(id ORDER BY id) AS ids
    FROM financial_transactions
    WHERE fingerprint IS NOT NULL
    GROUP BY account_id, fingerprint
    HAVING count(*) > 1
  ` as any[]
  for (const c of collisions) {
    for (let k = 1; k < c.ids.length; k++) {
      const id = c.ids[k]
      const newFp = `${c.fingerprint}#${k}`
      await sql`UPDATE financial_transactions SET fingerprint = ${newFp} WHERE id = ${id}`
    }
  }
  if (collisions.length) console.log(`   disambiguated ${collisions.length} collision group(s)`)

  console.log('4/5 Setting fingerprint NOT NULL...')
  await sql`ALTER TABLE financial_transactions ALTER COLUMN fingerprint SET NOT NULL`

  console.log('5/5 Swapping unique index...')
  await sql`DROP INDEX IF EXISTS fin_txn_dedup`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS fin_txn_fingerprint ON financial_transactions (account_id, fingerprint)`

  console.log('Done.')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
