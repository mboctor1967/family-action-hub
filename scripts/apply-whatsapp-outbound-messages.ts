/**
 * Wave 1 / T-1 — additive schema change for WhatsApp delivery reliability.
 * CREATE ... IF NOT EXISTS only: idempotent, non-destructive. Not `drizzle-kit push`,
 * which on this shared database would propose dropping boctor-financials' bf_* tables.
 * Brief: docs/features/2026-09-25-whatsapp-delivery-reliability.md
 */
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)

async function run() {
  await sql`
    CREATE TABLE IF NOT EXISTS whatsapp_outbound_messages (
      id          text PRIMARY KEY,
      recipient   text NOT NULL,
      kind        text NOT NULL,
      status      text NOT NULL DEFAULT 'accepted',
      error_code  integer,
      error_title text,
      created_at  timestamp NOT NULL DEFAULT now(),
      status_at   timestamp
    )`
  await sql`CREATE INDEX IF NOT EXISTS idx_wa_outbound_recipient_created
            ON whatsapp_outbound_messages (recipient, created_at)`

  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'whatsapp_outbound_messages'
    ORDER BY ordinal_position`
  console.table(cols)
  console.log(cols.length === 8 ? 'TC-001a PASS — 8 columns present' : `TC-001a FAIL — expected 8, got ${cols.length}`)
}
run().catch((e) => { console.error(e); process.exit(1) })
