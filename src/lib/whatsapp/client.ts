const GRAPH_VERSION = 'v21.0'

export type SendMessageArgs = {
  to: string
  body: string
  replyToMessageId?: string
}

export async function sendMessage({ to, body, replyToMessageId }: SendMessageArgs): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) throw new Error('WhatsApp env vars not set')

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  }
  if (replyToMessageId) payload.context = { message_id: replyToMessageId }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error('[whatsapp] send failed', res.status, text)
  }
}
