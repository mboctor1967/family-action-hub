/**
 * POST /api/financials/invoices/scan
 *
 * Trigger a scan for a supplier. Returns an SSE stream with progress.
 * Same pattern as the tax export: the work runs inside the stream handler
 * so the serverless function stays alive.
 *
 * Body: { supplierId: string }
 *
 * v0.1.3 — Invoice Reader Integration
 */

import { auth } from '@/lib/auth'
import { getDriveTokenForUser } from '@/lib/gdrive/tokens'
import { scanSupplierInvoices, scanAllSuppliers } from '@/lib/financials/invoice-scanner'
import type { ScanProgressEvent } from '@/types/financials'

export const maxDuration = 300 // 5 minutes

/**
 * POST /api/financials/invoices/scan
 *
 * Body: { supplierId: string } — scan one supplier
 * OR:   { fy: string }         — scan ALL active suppliers for that FY (query-based, ignores labels)
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if ((session.user as any).role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const supplierId: string | undefined = body?.supplierId
  const fy: string | undefined = body?.fy

  if (!supplierId && !fy) {
    return new Response(JSON.stringify({ error: 'supplierId or fy is required' }), { status: 400 })
  }

  const token = await getDriveTokenForUser(session.user.id)
  if (!token) {
    return new Response(JSON.stringify({ error: 'No Google OAuth tokens found' }), { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ScanProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {}
      }

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {}
      }, 10000)

      try {
        if (fy) {
          // Scan ALL suppliers for the given FY
          await scanAllSuppliers(fy, token, async (event) => send(event))
        } else {
          // Scan a single supplier
          const result = await scanSupplierInvoices(
            { supplierId: supplierId!, token },
            async (event) => send(event)
          )
          send({
            type: 'complete',
            emailsFound: result.emailsFound,
            invoicesExtracted: result.invoicesExtracted,
            message: result.errors.length > 0
              ? `Completed with ${result.errors.length} error(s): ${result.errors[0]}`
              : `Done: ${result.invoicesExtracted} invoices from ${result.emailsFound} emails (${result.duplicatesSkipped} duplicates skipped)`,
          })
        }
      } catch (err: any) {
        send({ type: 'error', message: err?.message ?? String(err) })
      } finally {
        clearInterval(heartbeat)
        try { controller.close() } catch {}
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
