/**
 * One-off backfill (AC-014).
 *
 * Before this feature, a scan that threw left its scan_runs row at 'running'
 * forever. 159 such rows accumulated between 2026-05 and 2026-08. They are
 * indistinguishable from a run that is genuinely in flight, which makes the
 * status column useless for monitoring until they are resolved.
 *
 * Marks any run older than 6 hours with no completed_at as failed. Idempotent.
 */
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)

async function run() {
  const before = await sql`
    SELECT count(*)::int AS n FROM scan_runs
    WHERE status = 'running' AND completed_at IS NULL
      AND started_at < now() - interval '6 hours'`
  console.log(`Abandoned runs to backfill: ${before[0].n}`)

  if (before[0].n === 0) {
    console.log('Nothing to do.')
    return
  }

  const updated = await sql`
    UPDATE scan_runs
    SET status = 'failed',
        completed_at = started_at,
        error_message = 'backfilled: abandoned run'
    WHERE status = 'running' AND completed_at IS NULL
      AND started_at < now() - interval '6 hours'
    RETURNING id`
  console.log(`Marked ${updated.length} run(s) as failed.`)

  console.table(
    await sql`SELECT status, count(*) AS runs FROM scan_runs GROUP BY status ORDER BY runs DESC`,
  )
}
run().catch((e) => { console.error(e); process.exit(1) })
