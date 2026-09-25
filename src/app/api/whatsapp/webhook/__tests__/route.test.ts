import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * TC-002 (AC-002) — tapping "Show digest" on the template sends the full digest.
 * TC-005 (AC-005) — Meta `statuses` callbacks update the outbound log, so a message
 * dropped outside the 24h window is recorded instead of vanishing.
 */

const h = vi.hoisted(() => ({
  processed: [] as string[],
  alreadyProcessed: false,
  snapshot: null as null | Record<string, unknown>,
  handleDigestReply: vi.fn(),
  sendFullDigest: vi.fn(),
  runDailyDigest: vi.fn(),
  applyStatusUpdate: vi.fn(),
  sendMessage: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}))

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => unknown) => { h.afterCallbacks.push(fn) },
}))
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (h.alreadyProcessed ? [{ id: 'dup' }] : []) }) }) }),
    insert: () => ({ values: async (v: { id: string }) => { h.processed.push(v.id) } }),
  },
}))
vi.mock('@/lib/whatsapp/verify', () => ({ verifySignature: () => true }))
vi.mock('@/lib/whatsapp/allowlist', () => ({ isAllowed: (p: string) => p === '61412408587' }))
vi.mock('@/lib/whatsapp/client', () => ({ sendMessage: h.sendMessage }))
vi.mock('@/lib/whatsapp/digest-snapshot', () => ({ getActiveSnapshotForPhone: async () => h.snapshot }))
vi.mock('@/lib/whatsapp/digest-reply-handler', () => ({ handleDigestReply: h.handleDigestReply }))
vi.mock('@/lib/whatsapp/daily-digest', () => ({
  DIGEST_BUTTON_PAYLOAD: 'SHOW_DIGEST',
  sendFullDigest: h.sendFullDigest,
  runDailyDigest: h.runDailyDigest,
}))
vi.mock('@/lib/whatsapp/outbound-log', () => ({ applyStatusUpdate: h.applyStatusUpdate }))
vi.mock('@/lib/whatsapp/commands', () => ({ handleCommand: async () => 'cmd-reply' }))

import { POST } from '../route'

function post(value: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'x-hub-signature-256': 'sha256=x' },
    body: JSON.stringify({ entry: [{ changes: [{ value }] }] }),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  h.processed = []
  h.afterCallbacks = []
  h.alreadyProcessed = false
  h.snapshot = null
  h.handleDigestReply.mockResolvedValue('✅ Task created')
  process.env.DIGEST_FALLBACK_USER_ID = 'user-1'
  process.env.WHATSAPP_APP_SECRET = 'secret'
  h.sendFullDigest.mockResolvedValue(undefined)
  h.applyStatusUpdate.mockResolvedValue(undefined)
  h.sendMessage.mockResolvedValue('wamid.r')
  h.runDailyDigest.mockResolvedValue({ sent: 2, failed: 0, skipped: 0 })
})

describe('Show digest button (AC-002)', () => {
  it('TC-002 — a quick-reply tap sends the full digest to the tapper', async () => {
    const res = await post({
      messages: [{ id: 'wamid.in1', from: '61412408587', type: 'button', button: { payload: 'SHOW_DIGEST', text: 'Show digest' } }],
    })
    expect(res.status).toBe(200)
    expect(h.sendFullDigest).toHaveBeenCalledWith('61412408587')
  })

  it('ignores a tap from a number not on the allowlist', async () => {
    await post({ messages: [{ id: 'wamid.in2', from: '61499999999', type: 'button', button: { payload: 'SHOW_DIGEST' } }] })
    expect(h.sendFullDigest).not.toHaveBeenCalled()
  })

  it('answers with an apology rather than a 500 when the digest send fails', async () => {
    h.sendFullDigest.mockRejectedValue(new Error('db down'))
    const res = await post({ messages: [{ id: 'wamid.in3', from: '61412408587', type: 'button', button: { payload: 'SHOW_DIGEST' } }] })
    expect(res.status).toBe(200)
    expect(h.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ to: '61412408587' }))
  })
})

describe('delivery statuses (AC-005)', () => {
  it('TC-005 — records a failed status with its Meta error code and title', async () => {
    const res = await post({
      statuses: [{
        id: 'wamid.out1', status: 'failed', timestamp: '1790280007', recipient_id: '61412408587',
        errors: [{ code: 131047, title: 'Re-engagement message' }],
      }],
    })
    expect(res.status).toBe(200)
    expect(h.applyStatusUpdate).toHaveBeenCalledWith({
      id: 'wamid.out1', status: 'failed', timestamp: '1790280007', errorCode: 131047, errorTitle: 'Re-engagement message',
    })
  })

  it('records every status in a batched callback', async () => {
    await post({ statuses: [
      { id: 'a', status: 'sent', timestamp: '1' },
      { id: 'b', status: 'delivered', timestamp: '2' },
    ] })
    expect(h.applyStatusUpdate).toHaveBeenCalledTimes(2)
    expect(h.applyStatusUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'b', status: 'delivered', errorCode: null }))
  })
})

describe('scan command', () => {
  it('runs the digest after the response instead of an un-awaited fetch', async () => {
    await post({ messages: [{ id: 'wamid.in4', from: '61412408587', type: 'text', text: { body: 'scan' } }] })
    expect(h.afterCallbacks).toHaveLength(1)
    await h.afterCallbacks[0]()
    expect(h.runDailyDigest).toHaveBeenCalledTimes(1)
  })
})

describe('existing inbound paths (regression after the handleInbound refactor)', () => {
  const text = (id: string, body: string) => ({ messages: [{ id, from: '61412408587', type: 'text', text: { body } }] })

  it('routes a digest reply to the reply handler when a snapshot is active', async () => {
    h.snapshot = { id: 'snap-1', positions: [] }
    await post(text('wamid.r1', 'task 1'))
    expect(h.handleDigestReply).toHaveBeenCalledWith(expect.objectContaining({ phone: '61412408587', text: 'task 1', fallbackUserId: 'user-1' }))
    expect(h.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ body: '✅ Task created', replyToMessageId: 'wamid.r1' }))
  })

  it('explains there is no digest when a reply arrives without a snapshot', async () => {
    await post(text('wamid.r2', 'task 1'))
    expect(h.handleDigestReply).not.toHaveBeenCalled()
    expect(h.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('falls through to the command router for other text', async () => {
    await post(text('wamid.r3', 'balance'))
    expect(h.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ body: 'cmd-reply' }))
  })

  it('ignores a message it has already processed', async () => {
    h.alreadyProcessed = true
    await post(text('wamid.r4', 'balance'))
    expect(h.sendMessage).not.toHaveBeenCalled()
    expect(h.processed).toHaveLength(0)
  })

  it('still answers 200 when a reply send is rejected by Meta', async () => {
    h.sendMessage.mockRejectedValue(new Error('131047'))
    const res = await post(text('wamid.r5', 'balance'))
    expect(res.status).toBe(200)
  })
})
