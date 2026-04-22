/**
 * One-off: flip the 5 most-recent already-triaged actionable emails back to 'unreviewed'
 * so the next digest has items to show.
 *
 * Filters:
 *   - classification = 'actionable'
 *   - triage_status IN ('confirmed','rejected')  (already-triaged, eligible to reseed)
 *   - ordered by date DESC (most recent first)
 *   - limit 5
 *
 * Also deletes any tasks derived from these emails (sourceEmailId) so the next
 * "task N" reply from the digest doesn't collide with a pre-existing task row.
 */
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)

async function run() {
  const candidates = await sql`
    SELECT id, subject, from_name, from_address, date, triage_status
    FROM emails_scanned
    WHERE classification = 'actionable'
      AND triage_status IN ('confirmed', 'rejected')
    ORDER BY date DESC NULLS LAST
    LIMIT 5
  ` as Array<Record<string, unknown>>

  if (candidates.length === 0) {
    console.log('No candidates found (no actionable emails in confirmed/rejected state).')
    return
  }

  console.log(`Selected ${candidates.length} emails to reseed:`)
  for (const c of candidates) {
    console.log(`  - ${c.id}  [${c.triage_status}]  ${(c.subject as string || '(no subject)').slice(0, 70)}`)
  }

  const ids = candidates.map((c) => c.id as string)

  // Delete any tasks derived from these emails so the digest reply can create fresh ones.
  const deletedTasks = await sql`
    DELETE FROM tasks
    WHERE source_email_id = ANY(${ids}::uuid[])
    RETURNING id
  ` as Array<Record<string, unknown>>

  const updated = await sql`
    UPDATE emails_scanned
    SET triage_status = 'unreviewed'
    WHERE id = ANY(${ids}::uuid[])
    RETURNING id
  ` as Array<Record<string, unknown>>

  console.log(`\nDeleted ${deletedTasks.length} derived task row(s).`)
  console.log(`Flipped ${updated.length} email row(s) back to 'unreviewed'.`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
