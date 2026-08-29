/**
 * Wave 1 / T-1 — additive schema change for the scan-reliability feature.
 * Purely ADD COLUMN IF NOT EXISTS: idempotent, non-destructive, no backfill.
 * Brief: docs/features/2026-08-29-scan-reliability-fail-loud.md
 */
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)

async function run() {
  await sql`ALTER TABLE scan_runs      ADD COLUMN IF NOT EXISTS error_message   text`
  await sql`ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS last_error      text`
  await sql`ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS last_error_code text`
  await sql`ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS last_error_at   timestamp`

  const cols = await sql`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE (table_name = 'scan_runs'      AND column_name = 'error_message')
       OR (table_name = 'gmail_accounts' AND column_name IN ('last_error','last_error_code','last_error_at'))
    ORDER BY table_name, column_name`
  console.table(cols)
  console.log(cols.length === 4 ? 'TC-001 PASS — all 4 columns present' : `TC-001 FAIL — expected 4, got ${cols.length}`)
}
run().catch((e) => { console.error(e); process.exit(1) })
