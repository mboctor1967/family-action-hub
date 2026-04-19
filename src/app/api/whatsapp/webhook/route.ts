import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { whatsappProcessedMessages } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { verifySignature } from '@/lib/whatsapp/verify'
import { parseCommand } from '@/lib/whatsapp/parse'
import { handleCommand } from '@/lib/whatsapp/commands'
import { sendMessage } from '@/lib/whatsapp/client'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: Request) {
  console.log('[wa-webhook] POST received')
  const rawBody = await request.text()
  console.log('[wa-webhook] body length:', rawBody.length)
  const signature = request.headers.get('x-hub-signature-256')
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret || !verifySignature(rawBody, signature, secret)) {
    console.warn('[wa-webhook] signature verify FAILED (secret present:', !!secret, ')')
    return new NextResponse('Unauthorized', { status: 401 })
  }
  console.log('[wa-webhook] signature OK')

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    console.warn('[wa-webhook] JSON parse failed')
    return NextResponse.json({ ok: true })
  }

  interface WaMessage {
    id: string
    from: string
    type: string
    text?: { body?: string }
  }
  const firstChange = (payload as { entry?: { changes?: { value?: { messages?: WaMessage[]; statuses?: unknown[] } }[] }[] } | null)
    ?.entry?.[0]?.changes?.[0]?.value
  const message = firstChange?.messages?.[0]
  if (!message) {
    console.log('[wa-webhook] no message in payload; keys:',
      firstChange ? Object.keys(firstChange).join(',') : 'none')
    return NextResponse.json({ ok: true })
  }
  console.log('[wa-webhook] message from=', message.from, 'type=', message.type, 'id=', message.id)

  const existing = await db
    .select({ id: whatsappProcessedMessages.id })
    .from(whatsappProcessedMessages)
    .where(eq(whatsappProcessedMessages.id, message.id))
    .limit(1)
  if (existing.length > 0) {
    console.log('[wa-webhook] idempotency hit — already processed')
    return NextResponse.json({ ok: true })
  }

  await db.insert(whatsappProcessedMessages).values({ id: message.id })

  const allowed = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const from = normalisePhone(message.from)
  const isAllowed = allowed.some((a) => normalisePhone(a) === from)
  console.log('[wa-webhook] allowlist check: from=', from, 'allowed=', allowed.map(normalisePhone).join('|'), 'match=', isAllowed)
  if (!isAllowed) return NextResponse.json({ ok: true })

  if (message.type !== 'text') {
    console.log('[wa-webhook] non-text message, skipping')
    return NextResponse.json({ ok: true })
  }

  const cmd = parseCommand(message.text?.body ?? '')
  console.log('[wa-webhook] parsed cmd:', JSON.stringify(cmd))
  const reply = await handleCommand(cmd)
  console.log('[wa-webhook] reply length:', reply.length)

  await sendMessage({ to: message.from, body: reply, replyToMessageId: message.id })
  console.log('[wa-webhook] send completed')
  return NextResponse.json({ ok: true })
}

function normalisePhone(p: string): string {
  return p.replace(/[^\d+]/g, '').replace(/^\+/, '')
}
