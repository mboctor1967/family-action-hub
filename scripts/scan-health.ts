/**
 * Scan health check — `npm run scan:health`
 *
 * The passive backstop for the Gmail scan pipeline (AC-015). Answers, in one
 * command: is the credential alive, when did a scan last actually succeed, and
 * is anything being ingested?
 *
 * Written after a four-month silent outage in which every one of these questions
 * had an alarming answer and nothing surfaced it.
 */
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)

function daysSince(d: Date | string | null): string {
  if (!d) return 'never'
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  return days === 0 ? 'today' : `${days}d ago`
}

async function run() {
  const accounts = await sql`
    SELECT email, last_scan_at, last_error, last_error_code, last_error_at,
           (refresh_token IS NOT NULL) AS has_refresh
    FROM gmail_accounts ORDER BY email`

  console.log('\n=== GMAIL ACCOUNTS ===')
  for (const a of accounts) {
    // Health is NOT just "no recorded error". An absent error can simply mean no
    // failure was ever written down — which is exactly how a four-month outage
    // displayed as healthy. A daily digest that has not succeeded in 48h is
    // unhealthy regardless of what the error columns say.
    const staleMs = a.last_scan_at ? Date.now() - new Date(a.last_scan_at).getTime() : Infinity
    const isStale = staleMs > 48 * 3600 * 1000
    const healthy = !a.last_error_code && !isStale
    console.log(`\n  ${a.email}  ${healthy ? '[HEALTHY]' : '[NEEDS ATTENTION]'}`)
    console.log(`    last successful scan : ${a.last_scan_at ?? 'never'} (${daysSince(a.last_scan_at)})`)
    console.log(`    refresh token        : ${a.has_refresh ? 'present' : 'MISSING'}`)
    if (isStale) {
      console.log(`    STALE                : last success ${daysSince(a.last_scan_at)} — a daily digest should never be this old`)
    }
    if (a.last_error_code) {
      console.log(`    last error code      : ${a.last_error_code}  at ${a.last_error_at}`)
      console.log(`    last error           : ${a.last_error}`)
    }
  }

  console.log('\n=== RECENT SCAN RUNS (last 14) ===')
  console.table(
    await sql`
      SELECT started_at, status, emails_scanned, actionable_count,
             EXTRACT(EPOCH FROM (completed_at - started_at))::int AS dur_s,
             left(coalesce(error_message, ''), 60) AS error
      FROM scan_runs ORDER BY started_at DESC LIMIT 14`,
  )

  console.log('\n=== RUN OUTCOMES (last 30d) ===')
  console.table(
    await sql`
      SELECT status, count(*) AS runs
      FROM scan_runs WHERE started_at > now() - interval '30 days'
      GROUP BY status ORDER BY runs DESC`,
  )

  console.log('\n=== INGEST PER DAY (last 14d) ===')
  const ingest = await sql`
    SELECT date_trunc('day', created_at)::date AS day, count(*) AS rows,
           count(*) FILTER (WHERE classification = 'actionable') AS actionable
    FROM emails_scanned WHERE created_at > now() - interval '14 days'
    GROUP BY 1 ORDER BY 1 DESC`
  if (ingest.length === 0) console.log('  (nothing ingested in the last 14 days)')
  else console.table(ingest)

  const stuck = await sql`
    SELECT count(*)::int AS n FROM scan_runs
    WHERE status = 'running' AND started_at < now() - interval '6 hours'`
  if (stuck[0].n > 0) {
    console.log(`\n  WARNING: ${stuck[0].n} abandoned 'running' run(s). Run scripts/backfill-abandoned-runs.ts`)
  }
  console.log('')
}
run().catch((e) => { console.error(e); process.exit(1) })
