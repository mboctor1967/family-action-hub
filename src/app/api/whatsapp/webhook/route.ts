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
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret || !verifySignature(rawBody, signature, secret)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: true })
  }

  const message = (payload as Record<string, unknown> | null)
    ? ((payload as { entry?: { changes?: { value?: { messages?: unknown[] } }[] }[] })
        ?.entry?.[0]?.changes?.[0]?.value?.messages?.[0])
    : undefined
  if (!message) return NextResponse.json({ ok: true })

  const existing = await db
    .select({ id: whatsappProcessedMessages.id })
    .from(whatsappProcessedMessages)
    .where(eq(whatsappProcessedMessages.id, message.id))
    .limit(1)
  if (existing.length > 0) return NextResponse.json({ ok: true })

  await db.insert(whatsappProcessedMessages).values({ id: message.id })

  const allowed = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const from = normalisePhone(message.from)
  const isAllowed = allowed.some((a) => normalisePhone(a) === from)
  if (!isAllowed) return NextResponse.json({ ok: true })

  if (message.type !== 'text') return NextResponse.json({ ok: true })

  const cmd = parseCommand(message.text?.body ?? '')
  const reply = await handleCommand(cmd)

  await sendMessage({ to: message.from, body: reply, replyToMessageId: message.id })
  return NextResponse.json({ ok: true })
}

function normalisePhone(p: string): string {
  return p.replace(/[^\d+]/g, '').replace(/^\+/, '')
}
