import { NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { whatsappProcessedMessages } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { verifySignature } from '@/lib/whatsapp/verify'
import { sendMessage } from '@/lib/whatsapp/client'
import { isAllowed } from '@/lib/whatsapp/allowlist'
import { getActiveSnapshotForPhone } from '@/lib/whatsapp/digest-snapshot'
import { handleDigestReply } from '@/lib/whatsapp/digest-reply-handler'
import { formatNoSnapshot, formatBotHelp } from '@/lib/whatsapp/digest-format'
import { DIGEST_BUTTON_PAYLOAD, sendFullDigest, runDailyDigest } from '@/lib/whatsapp/daily-digest'
import { applyStatusUpdate } from '@/lib/whatsapp/outbound-log'

// The `scan` command runs the whole digest (scan + AI classification) in `after()`.
export const maxDuration = 300

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
    button?: { payload?: string; text?: string }
  }
  interface WaStatus {
    id: string
    status: string
    timestamp?: string
    errors?: { code?: number; title?: string }[]
  }
  const value = (payload as { entry?: { changes?: { value?: { messages?: WaMessage[]; statuses?: WaStatus[] } }[] }[] } | null)
    ?.entry?.[0]?.changes?.[0]?.value

  // Delivery receipts for messages we sent. This is the only place Meta reports a
  // message it accepted but could not deliver (e.g. 131047, outside the 24h window).
  // AC-005.
  if (value?.statuses?.length) {
    for (const st of value.statuses) {
      try {
        await applyStatusUpdate({
          id: st.id,
          status: st.status,
          timestamp: st.timestamp,
          errorCode: st.errors?.[0]?.code ?? null,
          errorTitle: st.errors?.[0]?.title ?? null,
        })
      } catch (err) {
        console.error('[webhook] failed to record status', st.id, err instanceof Error ? err.message : err)
      }
    }
  }

  const message = value?.messages?.[0]
  if (!message) return NextResponse.json({ ok: true })

  const existing = await db
    .select({ id: whatsappProcessedMessages.id })
    .from(whatsappProcessedMessages)
    .where(eq(whatsappProcessedMessages.id, message.id))
    .limit(1)
  if (existing.length > 0) return NextResponse.json({ ok: true })

  await db.insert(whatsappProcessedMessages).values({ id: message.id })

  // sendMessage throws on a Meta rejection. Answer 200 regardless: the message is
  // already marked processed, so a 500 would only make Meta retry into the dedupe.
  try {
    return await handleInbound(message)
  } catch (err) {
    console.error('[webhook] handling failed for', message.id, err instanceof Error ? err.message : err)
    return NextResponse.json({ ok: true })
  }
}

type InboundMessage = {
  id: string
  from: string
  type: string
  text?: { body?: string }
  button?: { payload?: string; text?: string }
}

async function handleInbound(message: InboundMessage): Promise<NextResponse> {
  if (!isAllowed(message.from)) return NextResponse.json({ ok: true })

  // "Show digest" tap on the daily template. The tap is itself an inbound message,
  // so the 24h window is now open and the full free-form digest will be delivered.
  // AC-002.
  if (message.type === 'button' && message.button?.payload === DIGEST_BUTTON_PAYLOAD) {
    try {
      await sendFullDigest(message.from)
    } catch (err) {
      console.error('[webhook] full digest failed for', message.from, err instanceof Error ? err.message : err)
      await sendMessage({
        to: message.from,
        body: '⚠️ Could not load the digest — try the button again, or open Scan in the hub.',
        replyToMessageId: message.id,
      }).catch(() => {})
    }
    return NextResponse.json({ ok: true })
  }

  if (message.type !== 'text') return NextResponse.json({ ok: true })

  const body = message.text?.body ?? ''

  // Digest-reply branch — runs before the scan command and the help fallback.
  // Detect digest intent by prefix so malformed replies still get the digest
  // help grammar rather than the generic help text.
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
    // Run after the response, not as an un-awaited fetch: a serverless function may
    // be frozen as soon as it responds, silently killing a fire-and-forget request.
    after(async () => {
      try {
        await runDailyDigest()
      } catch (err) {
        console.error('[scan command] digest run failed', err instanceof Error ? err.message : err)
      }
    })
    await sendMessage({
      to: message.from,
      body: '🔄 Scanning Gmail now — digest will arrive in 20-60 seconds.',
      replyToMessageId: message.id,
    })
    return NextResponse.json({ ok: true })
  }

  // Anything else gets the help text. The spend / balance / recent commands read the
  // money tables owned by the other app and were retired in P3 (DEC-1).
  await sendMessage({ to: message.from, body: formatBotHelp(), replyToMessageId: message.id })
  return NextResponse.json({ ok: true })
}
