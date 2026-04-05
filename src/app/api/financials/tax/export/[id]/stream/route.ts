/**
 * GET /api/financials/tax/export/[id]/stream
 *
 * SSE stream for export job progress. Polls the export_jobs row every 500ms
 * and emits progress events. Closes the stream on terminal status.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { exportJobs } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

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
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          // stream already closed
        }
      }, 10000)

      let lastStep: string | null = null
      let lastPercent = -1
      const maxDurationMs = 10 * 60 * 1000 // 10 min hard limit
      const startTime = Date.now()

      try {
        while (Date.now() - startTime < maxDurationMs) {
          const [job] = await db
            .select()
            .from(exportJobs)
            .where(eq(exportJobs.id, jobId))
            .limit(1)

          if (!job) {
            send({ type: 'error', message: 'Job not found' })
            break
          }

          // Auth check: only the requester can read their job
          if (job.requestedBy !== userId) {
            send({ type: 'error', message: 'Forbidden' })
            break
          }

          if (job.currentStep !== lastStep || (job.progressPercent ?? 0) !== lastPercent) {
            send({
              type: 'progress',
              step: job.currentStep ?? '',
              percent: job.progressPercent ?? 0,
            })
            lastStep = job.currentStep
            lastPercent = job.progressPercent ?? 0
          }

          if (job.status === 'complete') {
            send({
              type: 'complete',
              blobUrl: job.blobUrl,
              expiresAt: job.expiresAt.toISOString(),
            })
            break
          }

          if (job.status === 'error') {
            send({ type: 'error', message: job.errorMessage ?? 'Unknown error' })
            break
          }

          if (job.status === 'cancelled') {
            send({ type: 'error', message: 'Export cancelled' })
            break
          }

          // Poll interval
          await new Promise(r => setTimeout(r, 500))
        }
      } finally {
        clearInterval(heartbeat)
        controller.close()
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
