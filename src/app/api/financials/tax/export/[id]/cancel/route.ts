/**
 * POST /api/financials/tax/export/[id]/cancel
 *
 * Marks an export job as cancelled. The bundler task checks status at step
 * boundaries and aborts when it sees cancelled.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { exportJobs } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: jobId } = await context.params

  const result = await db
    .update(exportJobs)
    .set({ status: 'cancelled', completedAt: new Date() })
    .where(
      and(
        eq(exportJobs.id, jobId),
        eq(exportJobs.requestedBy, session.user.id),
        inArray(exportJobs.status, ['pending', 'running'])
      )
    )
    .returning({ id: exportJobs.id })

  if (result.length === 0) {
    return NextResponse.json({ error: 'Job not found or already finished' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
