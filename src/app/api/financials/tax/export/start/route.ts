/**
 * POST /api/financials/tax/export/start
 *
 * Creates an export job row with status='pending' and returns the job ID.
 * The client then connects to GET /api/financials/tax/export/[id]/stream,
 * which is where the bundler actually runs — the SSE stream keeps the
 * serverless function alive for the duration of the export.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { exportJobs } from '@/lib/db/schema'
import { lt } from 'drizzle-orm'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const fy: string | undefined = body?.fy
  const entityIds: string[] | undefined = Array.isArray(body?.entityIds) ? body.entityIds : undefined

  if (!fy || !/^FY\d{4}-\d{2}$/.test(fy)) {
    return NextResponse.json({ error: 'Invalid fy format (expected FYxxxx-xx)' }, { status: 400 })
  }

  // Opportunistic cleanup of expired jobs
  try {
    await db.delete(exportJobs).where(lt(exportJobs.expiresAt, new Date()))
  } catch (err) {
    console.warn('[tax-export] cleanup failed:', err)
  }

  // Create job row — bundler runs inside the SSE stream handler, not here.
  // (Fire-and-forget async work doesn't survive on Vercel serverless.)
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
  const [job] = await db
    .insert(exportJobs)
    .values({
      fy,
      requestedBy: session.user.id,
      status: 'pending',
      progressPercent: 0,
      currentStep: 'Waiting for stream connection',
      expiresAt,
      // Store entityIds serialized into currentStep is wrong — we need a proper column.
      // For F1 we only support "all entities" so entityIds is always null.
      // If we add partial-entity export later, add an entity_ids text[] column.
    })
    .returning({ id: exportJobs.id })

  if (entityIds && entityIds.length > 0) {
    console.warn('[tax-export] entityIds filter not yet supported — exporting all entities')
  }

  return NextResponse.json({ jobId: job.id })
}
