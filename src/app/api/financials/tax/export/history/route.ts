/**
 * GET /api/financials/tax/export/history
 *
 * Returns the last 20 export jobs for the current user, newest first.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { exportJobs } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const jobs = await db
    .select()
    .from(exportJobs)
    .where(eq(exportJobs.requestedBy, session.user.id))
    .orderBy(desc(exportJobs.createdAt))
    .limit(20)

  const now = new Date()
  return NextResponse.json({
    jobs: jobs.map(j => ({
      id: j.id,
      fy: j.fy,
      status: j.status,
      progressPercent: j.progressPercent ?? 0,
      currentStep: j.currentStep,
      blobUrl: j.blobUrl,
      errorMessage: j.errorMessage,
      createdAt: j.createdAt?.toISOString() ?? null,
      completedAt: j.completedAt?.toISOString() ?? null,
      expiresAt: j.expiresAt.toISOString(),
      expired: j.expiresAt < now,
    })),
  })
}
