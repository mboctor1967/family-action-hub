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
  // Detect digest intent by prefix so malformed replies still get the digest
  // help grammar (not the old spend/balance/recent router).
  const looksLikeDigest = /^\s*(task|reject|done|help)\b/i.test(body)
  const snapshot = await getActiveSnapshotForPhone(message.from)
  if (snapshot && looksLikeDigest) {
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
  if (!snapshot && looksLikeDigest) {
    // No active snapshot — explain rather than falling through to "unknown command".
    await sendMessage({
      to: message.from,
      body: formatNoSnapshot(),
      replyToMessageId: message.id,
    })
    return NextResponse.json({ ok: true })
  }

  // Force-scan command — triggers the digest cron on demand (on top of the 20:00 UTC schedule).
  if (/^\s*scan\s*$/i.test(body)) {
    const cronSecret = process.env.CRON_SECRET
    const appUrl = process.env.AUTH_URL ?? 'https://family-action-hub.vercel.app'
    if (cronSecret) {
      // Fire and forget — don't await. The digest will arrive on its own.
      fetch(`${appUrl}/api/cron/digest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cronSecret}` },
      }).catch((err) => console.error('[scan command] cron trigger failed', err))
    } else {
      console.error('[scan command] CRON_SECRET not set')
    }
    await sendMessage({
      to: message.from,
      body: '🔄 Scanning Gmail now — digest will arrive in 20-60 seconds.',
      replyToMessageId: message.id,
    })
    return NextResponse.json({ ok: true })
  }

  // Fall through: existing single-word command router
  const cmd = parseCommand(body)
  const reply = await handleCommand(cmd)
  await sendMessage({ to: message.from, body: reply, replyToMessageId: message.id })
  return NextResponse.json({ ok: true })
}
