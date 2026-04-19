import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { gmailAccounts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { runScanForAccount, type ScanProgressEvent } from '@/lib/scan/run-scan'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { gmailAccountId, scanWindow = '7d', forceRescan = false } = body

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // Resolve the account ID — the caller may omit it (use first account for this user)
        let resolvedAccountId: string | undefined = gmailAccountId
        if (!resolvedAccountId) {
          const results = await db
            .select()
            .from(gmailAccounts)
            .where(eq(gmailAccounts.userId, session.user!.id!))
            .limit(1)
          resolvedAccountId = results[0]?.id
        }

        if (!resolvedAccountId) {
          send('error', { error: 'No Gmail account connected. Go to Settings to connect.' })
          return
        }

        // Forward structured progress events back as SSE frames
        const onProgress = (evt: ScanProgressEvent) => {
          send(evt.event, evt.data)
        }

        await runScanForAccount(resolvedAccountId, {
          onProgress,
          scanWindow,
          forceRescan,
          maxEmails: 100,
        })
      } catch (error) {
        console.error('Scan error:', error)
        send('error', { error: error instanceof Error ? error.message : 'Scan failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
