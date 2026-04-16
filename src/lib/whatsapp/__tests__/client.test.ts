import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendMessage } from '../client'

beforeEach(() => {
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok'
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-123'
})

describe('sendMessage', () => {
  it('POSTs to Graph API with bearer token and correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' })
    vi.stubGlobal('fetch', fetchMock)

    await sendMessage({ to: '+61400111222', body: 'hello', replyToMessageId: 'wamid.X' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/phone-123/messages')
    expect(init.headers.Authorization).toBe('Bearer tok')
    const body = JSON.parse(init.body)
    expect(body.messaging_product).toBe('whatsapp')
    expect(body.to).toBe('+61400111222')
    expect(body.text.body).toBe('hello')
    expect(body.context.message_id).toBe('wamid.X')
  })

  it('omits context when no replyToMessageId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' })
    vi.stubGlobal('fetch', fetchMock)
    await sendMessage({ to: '+61400111222', body: 'hi' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.context).toBeUndefined()
  })
})
