import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { whatsappProcessedMessages } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { verifySignature } from '@/lib/whatsapp/verify'
import { parseCommand } from '@/lib/whatsapp/parse'
import { handleCommand } from '@/lib/whatsapp/commands'
import { sendMessage } from '@/lib/whatsapp/client'
import { isAllowed } from '@/lib/whatsapp/allowlist'
import { getActiveSnapshotForPhone } from '@/lib/whatsapp/digest-snapshot'
import { parseDigestReply } from '@/lib/whatsapp/digest-reply-parser'
import { handleDigestReply } from '@/lib/whatsapp/digest-reply-handler'
import { formatNoSnapshot } from '@/lib/whatsapp/digest-format'

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

  interface WaMessage {
    id: string
    from: string
    type: string
    text?: { body?: string }
  }
  const message = (payload as { entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[] } | null)
    ?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  if (!message) return NextResponse.json({ ok: true })

  const existing = await db
    .select({ id: whatsappProcessedMessages.id })
    .from(whatsappProcessedMessages)
    .where(eq(whatsappProcessedMessages.id, message.id))
    .limit(1)
  if (existing.length > 0) return NextResponse.json({ ok: true })

  await db.insert(whatsappProcessedMessages).values({ id: message.id })

  if (!isAllowed(message.from)) return NextResponse.json({ ok: true })

  if (message.type !== 'text') return NextResponse.json({ ok: true })

  const body = message.text?.body ?? ''

  // Digest-reply branch — runs before the single-word command router.
  // Digest replies are multi-word ("task 1,3 reject rest"), so we must try
  // digest parsing first when the sender has an active snapshot.
  const snapshot = await getActiveSnapshotForPhone(message.from)
  if (snapshot) {
    const maybeParsed = parseDigestReply(body, snapshot.positions.length)
    if (maybeParsed !== null || /^help$/i.test(body.trim())) {
      const fallbackUserId = process.env.DIGEST_FALLBACK_USER_ID
      if (!fallbackUserId) {
        console.error('[digest-reply] DIGEST_FALLBACK_USER_ID not set')
        await sendMessage({
          to: message.from,
          body: '⚠️ Digest reply failed — internal config error.',
          replyToMessageId: message.id,
        })
        return NextResponse.json({ ok: true })
      }
      const reply = await handleDigestReply({
        phone: message.from,
        text: body,
        snapshot,
        fallbackUserId,
      })
      await sendMessage({ to: message.from, body: reply, replyToMessageId: message.id })
      return NextResponse.json({ ok: true })
    }
  } else {
    // No active snapshot — if text LOOKS like digest grammar, explain rather than
    // falling through to "unknown command" from the single-word router.
    if (parseDigestReply(body, 1) !== null || /^help$/i.test(body.trim())) {
      await sendMessage({
        to: message.from,
        body: formatNoSnapshot(),
        replyToMessageId: message.id,
      })
      return NextResponse.json({ ok: true })
    }
  }

  // Fall through: existing single-word command router
  const cmd = parseCommand(body)
  const reply = await handleCommand(cmd)
  await sendMessage({ to: message.from, body: reply, replyToMessageId: message.id })
  return NextResponse.json({ ok: true })
}
