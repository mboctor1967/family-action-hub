/**
 * POST /api/financials/tax/export/start
 *
 * Creates an export job, spawns the bundler asynchronously, returns the job ID.
 * The client connects to GET /api/financials/tax/export/[id]/stream to follow progress.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { exportJobs } from '@/lib/db/schema'
import { eq, lt } from 'drizzle-orm'
import { buildExportZip, type BundlerProgress } from '@/lib/financials/tax-export/bundler'
import { getDriveTokenForUser } from '@/lib/gdrive/tokens'

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

  // Create job row
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
  const [job] = await db
    .insert(exportJobs)
    .values({
      fy,
      requestedBy: session.user.id,
      status: 'pending',
      progressPercent: 0,
      expiresAt,
    })
    .returning({ id: exportJobs.id })

  // Spawn bundler asynchronously — do NOT await
  runBundlerInBackground(job.id, fy, entityIds, session.user.id).catch(err => {
    console.error('[tax-export] bundler crashed:', err)
  })

  return NextResponse.json({ jobId: job.id })
}

async function runBundlerInBackground(
  jobId: string,
  fy: string,
  entityIds: string[] | undefined,
  userId: string
): Promise<void> {
  try {
    await db
      .update(exportJobs)
      .set({ status: 'running', currentStep: 'Starting', progressPercent: 1 })
      .where(eq(exportJobs.id, jobId))

    const driveToken = await getDriveTokenForUser(userId)

    const onProgress = async (progress: BundlerProgress) => {
      await db
        .update(exportJobs)
        .set({
          currentStep: progress.step,
          progressPercent: progress.percent,
          status: 'running',
        })
        .where(eq(exportJobs.id, jobId))
    }

    const result = await buildExportZip(
      { fy, entityIds, driveToken },
      onProgress
    )

    await db
      .update(exportJobs)
      .set({
        status: 'complete',
        progressPercent: 100,
        currentStep: 'Complete',
        blobUrl: result.blobUrl,
        completedAt: new Date(),
      })
      .where(eq(exportJobs.id, jobId))
  } catch (err: any) {
    console.error('[tax-export] job failed:', jobId, err)
    await db
      .update(exportJobs)
      .set({
        status: 'error',
        errorMessage: err?.message ?? String(err),
        completedAt: new Date(),
      })
      .where(eq(exportJobs.id, jobId))
  }
}
