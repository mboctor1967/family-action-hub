import { recordOutbound, type OutboundKind } from '@/lib/whatsapp/outbound-log'

const GRAPH_VERSION = 'v21.0'

export type SendMessageArgs = {
  to: string
  body: string
  replyToMessageId?: string
  kind?: OutboundKind
}

export type SendTemplateArgs = {
  to: string
  name: string
  bodyParams: string[]
  /** Payload for the template's first quick-reply button, echoed back when tapped. */
  quickReplyPayload?: string
  kind: OutboundKind
}

/** Meta rejected the send. `code` is Meta's error code, e.g. 131047 (outside 24h window). */
export class WhatsAppSendError extends Error {
  constructor(message: string, readonly status: number, readonly code: number | null) {
    super(message)
    this.name = 'WhatsAppSendError'
  }
}

/**
 * Free-form text. Meta only delivers it within 24h of the recipient's last inbound
 * message — anything business-initiated (digest, ops alert) must use `sendTemplate`.
 * @returns the Meta message id (wamid).
 */
export async function sendMessage({ to, body, replyToMessageId, kind = 'reply' }: SendMessageArgs): Promise<string> {
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  }
  if (replyToMessageId) payload.context = { message_id: replyToMessageId }
  return post(payload, to, kind)
}

/** Pre-approved template: deliverable at any time, regardless of the 24h window. */
export async function sendTemplate({ to, name, bodyParams, quickReplyPayload, kind }: SendTemplateArgs): Promise<string> {
  const components: Record<string, unknown>[] = [
    { type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text: sanitizeTemplateParam(text) })) },
  ]
  if (quickReplyPayload) {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: '0',
      parameters: [{ type: 'payload', payload: quickReplyPayload }],
    })
  }
  return post({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG?.trim() || 'en' },
      components,
    },
  }, to, kind)
}

/** Template variables may not contain newlines, tabs or more than four consecutive spaces, nor be empty. */
export function sanitizeTemplateParam(text: string): string {
  const cleaned = text.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  return cleaned || '-'
}

async function post(payload: Record<string, unknown>, to: string, kind: OutboundKind): Promise<string> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) throw new Error('WhatsApp env vars not set')

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()

  // A rejected send used to be logged and then treated as delivered, so the ops
  // alert reported success while nothing arrived. It must throw.
  if (!res.ok) {
    let code: number | null = null
    let detail = text
    try {
      const err = JSON.parse(text)?.error
      code = typeof err?.code === 'number' ? err.code : null
      detail = err?.message ?? text
    } catch { /* non-JSON body — keep raw text */ }
    console.error('[whatsapp] send failed', res.status, code, detail)
    throw new WhatsAppSendError(`WhatsApp send failed (${res.status}${code ? `, code ${code}` : ''}): ${detail}`, res.status, code)
  }

  let id = ''
  try {
    id = JSON.parse(text)?.messages?.[0]?.id ?? ''
  } catch { /* fall through */ }

  if (id) {
    try {
      await recordOutbound({ id, recipient: to, kind })
    } catch (err) {
      // The message went out; losing its log row must not turn that into a failure.
      console.error('[whatsapp] failed to record outbound message', err instanceof Error ? err.message : err)
    }
  }
  return id
}
