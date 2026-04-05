/**
 * GET /api/financials/tax/export/[id]/stream
 *
 * SSE stream that BOTH runs the bundler AND reports progress.
 *
 * Why the bundler runs here instead of in /start:
 * On Vercel serverless, functions terminate when the HTTP response ends.
 * Fire-and-forget async work spawned from /start gets killed before it
 * can complete. The SSE stream keeps the function alive for the duration
 * of the export, so the bundler runs safely inside the stream handler.
 *
 * The first stream connection for a 'pending' job atomically claims it
 * and runs the bundler. Subsequent connections (e.g. after a reconnect)
 * just poll the DB for updates.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { exportJobs } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { buildExportZip } from '@/lib/financials/tax-export/bundler'
import { getDriveTokenForUser } from '@/lib/gdrive/tokens'

export const maxDuration = 300 // 5 minutes — generous for large exports

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if ((session.user as any).role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const { id: jobId } = await context.params
  const userId = session.user.id

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // stream already closed
        }
      }

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          // stream already closed
        }
      }, 10000)

      try {
        // Atomically claim the job: only the first stream connection runs the bundler.
        // If another process already claimed it, this UPDATE returns zero rows.
        const claimed = await db
          .update(exportJobs)
          .set({
            status: 'running',
            currentStep: 'Starting',
            progressPercent: 1,
          })
          .where(and(eq(exportJobs.id, jobId), eq(exportJobs.status, 'pending')))
          .returning()

        if (claimed.length > 0) {
          const job = claimed[0]

          // Auth check on the claim
          if (job.requestedBy !== userId) {
            send({ type: 'error', message: 'Forbidden (job belongs to a different user)' })
            return
          }

          // Run the bundler inline — the stream stays open for the duration
          try {
            const driveToken = await getDriveTokenForUser(userId)

            // Emit initial progress via SSE and persist to DB
            send({ type: 'progress', step: 'Starting', percent: 1 })

            const result = await buildExportZip(
              { fy: job.fy, entityIds: undefined, driveToken },
              async (progress) => {
                // Persist to DB (for resumability / history)
                await db
                  .update(exportJobs)
                  .set({
                    currentStep: progress.step,
                    progressPercent: progress.percent,
                    status: 'running',
                  })
                  .where(eq(exportJobs.id, jobId))
                // Emit directly to the SSE stream (realtime, no poll delay)
                send({
                  type: 'progress',
                  step: progress.step,
                  percent: progress.percent,
                })
              }
            )

            // Mark complete in DB
            const completedAt = new Date()
            await db
              .update(exportJobs)
              .set({
                status: 'complete',
                progressPercent: 100,
                currentStep: 'Complete',
                blobUrl: result.blobUrl,
                completedAt,
              })
              .where(eq(exportJobs.id, jobId))

            // Final SSE event
            send({
              type: 'complete',
              blobUrl: result.blobUrl,
              expiresAt: job.expiresAt.toISOString(),
            })
          } catch (err: any) {
            console.error('[tax-export] bundler failed:', jobId, err)
            const errorMessage = err?.message ?? String(err)
            await db
              .update(exportJobs)
              .set({
                status: 'error',
                errorMessage,
                completedAt: new Date(),
              })
              .where(eq(exportJobs.id, jobId))
            send({ type: 'error', message: errorMessage })
          }
          return
        }

        // Not claimed — either the job is already running (another stream connected first)
        // or it's already complete/errored. Fall through to polling mode.
        let lastStep: string | null = null
        let lastPercent = -1
        const startTime = Date.now()
        const maxDurationMs = 5 * 60 * 1000 // 5 min poll ceiling

        while (Date.now() - startTime < maxDurationMs) {
          const [current] = await db
            .select()
            .from(exportJobs)
            .where(eq(exportJobs.id, jobId))
            .limit(1)

          if (!current) {
            send({ type: 'error', message: 'Job not found' })
            return
          }

          if (current.requestedBy !== userId) {
            send({ type: 'error', message: 'Forbidden' })
            return
          }

          if (current.currentStep !== lastStep || (current.progressPercent ?? 0) !== lastPercent) {
            send({
              type: 'progress',
              step: current.currentStep ?? '',
              percent: current.progressPercent ?? 0,
            })
            lastStep = current.currentStep
            lastPercent = current.progressPercent ?? 0
          }

          if (current.status === 'complete') {
            send({
              type: 'complete',
              blobUrl: current.blobUrl,
              expiresAt: current.expiresAt.toISOString(),
            })
            return
          }

          if (current.status === 'error') {
            send({ type: 'error', message: current.errorMessage ?? 'Unknown error' })
            return
          }

          if (current.status === 'cancelled') {
            send({ type: 'error', message: 'Export cancelled' })
            return
          }

          await new Promise(r => setTimeout(r, 500))
        }
      } finally {
        clearInterval(heartbeat)
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
