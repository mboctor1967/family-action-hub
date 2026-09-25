import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ recordOutbound: vi.fn() }))
vi.mock('@/lib/whatsapp/outbound-log', () => ({ recordOutbound: h.recordOutbound }))

import { sendMessage, sendTemplate, WhatsAppSendError, sanitizeTemplateParam } from '../client'

const okResponse = (wamid = 'wamid.OK') => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ messages: [{ id: wamid }] }),
})

beforeEach(() => {
  vi.clearAllMocks()
  h.recordOutbound.mockResolvedValue(undefined)
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok'
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-123'
  process.env.WHATSAPP_TEMPLATE_LANG = ''
})

describe('sendMessage', () => {
  it('POSTs to Graph API with bearer token and correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
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
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    await sendMessage({ to: '+61400111222', body: 'hi' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.context).toBeUndefined()
  })

  it('TC-004 — returns the wamid and records the outbound row (AC-004, AC-005)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('wamid.ABC')))
    const id = await sendMessage({ to: '+61400111222', body: 'hi', kind: 'digest_full' })
    expect(id).toBe('wamid.ABC')
    expect(h.recordOutbound).toHaveBeenCalledWith({ id: 'wamid.ABC', recipient: '+61400111222', kind: 'digest_full' })
  })

  it('TC-004 — throws WhatsAppSendError carrying Meta code and title on non-2xx (AC-004)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { code: 131047, message: 'Re-engagement message' } }),
    }))
    const err = await sendMessage({ to: '+61400111222', body: 'hi' }).catch((e) => e)
    expect(err).toBeInstanceOf(WhatsAppSendError)
    expect(err.code).toBe(131047)
    expect(err.status).toBe(400)
    expect(err.message).toContain('Re-engagement message')
    expect(h.recordOutbound).not.toHaveBeenCalled()
  })

  it('does not fail the send when recording the outbound row fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('wamid.Z')))
    h.recordOutbound.mockRejectedValue(new Error('db down'))
    await expect(sendMessage({ to: '+61400111222', body: 'hi' })).resolves.toBe('wamid.Z')
  })
})

describe('sendTemplate', () => {
  it('sends a template with body params and a quick-reply payload (AC-001)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('wamid.T'))
    vi.stubGlobal('fetch', fetchMock)

    const id = await sendTemplate({
      to: '+61400111222',
      name: 'family_hub_digest',
      bodyParams: ['Thu 25 Sep', '4'],
      quickReplyPayload: 'SHOW_DIGEST',
      kind: 'digest_notice',
    })

    expect(id).toBe('wamid.T')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.type).toBe('template')
    expect(body.template.name).toBe('family_hub_digest')
    expect(body.template.language.code).toBe('en')
    expect(body.template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'Thu 25 Sep' }, { type: 'text', text: '4' }] },
      { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'SHOW_DIGEST' }] },
    ])
    expect(h.recordOutbound).toHaveBeenCalledWith({ id: 'wamid.T', recipient: '+61400111222', kind: 'digest_notice' })
  })

  it('honours WHATSAPP_TEMPLATE_LANG', async () => {
    process.env.WHATSAPP_TEMPLATE_LANG = 'en_AU'
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    await sendTemplate({ to: '+61400111222', name: 't', bodyParams: ['x'], kind: 'ops_alert' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.template.language.code).toBe('en_AU')
    expect(body.template.components).toHaveLength(1)
  })
})

describe('sanitizeTemplateParam', () => {
  it('strips newlines/tabs, collapses runs of spaces, never returns empty', () => {
    expect(sanitizeTemplateParam('a\nb\tc     d')).toBe('a b c d')
    expect(sanitizeTemplateParam('   ')).toBe('-')
  })
})
