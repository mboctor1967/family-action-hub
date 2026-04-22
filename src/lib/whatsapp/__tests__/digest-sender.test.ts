import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/whatsapp/client', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../digest-snapshot', () => ({
  persistSnapshot: vi.fn().mockResolvedValue('snap-1'),
  expireSnapshotsForPhone: vi.fn().mockResolvedValue(undefined),
}))

import { sendDigest } from '../digest-sender'
import { sendMessage } from '@/lib/whatsapp/client'
import { persistSnapshot, expireSnapshotsForPhone } from '../digest-snapshot'

const STATS = {
  windowFromLabel: '15 Apr',
  windowToLabel: '22 Apr',
  totalEmails: 87,
  newEmails: 12,
  alreadyScanned: 75,
  actionableCount: 1,
}

describe('sendDigest', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const items = [
    { id: 'uuid-abc', subject: 'Bill', fromName: 'AGL', fromAddress: 'a@b', gmailMessageId: 'abc' },
  ]

  it('expires previous snapshot, sends message, persists new snapshot', async () => {
    await sendDigest({ recipient: '+61412408587', items, dateLabel: '2026-04-22', stats: STATS })

    expect(expireSnapshotsForPhone).toHaveBeenCalledWith('+61412408587')
    expect(sendMessage).toHaveBeenCalledTimes(1)
    const sendArgs = (vi.mocked(sendMessage)).mock.calls[0][0] as Record<string, unknown>
    expect(sendArgs.to).toBe('+61412408587')
    expect(sendArgs.body).toContain('Gmail digest')
    expect(sendArgs.body).toContain('Window: 15 Apr – 22 Apr')
    expect(persistSnapshot).toHaveBeenCalledWith({
      recipient: '+61412408587',
      positions: [{ pos: 1, emailId: 'uuid-abc' }],
      messageId: null,
    })
  })

  it('sends zero-items heartbeat (with window stats) when items is empty', async () => {
    await sendDigest({
      recipient: '+61412408587',
      items: [],
      dateLabel: '2026-04-22',
      stats: { ...STATS, actionableCount: 0 },
    })
    const sendArgs = (vi.mocked(sendMessage)).mock.calls[0][0] as Record<string, unknown>
    expect(sendArgs.body).toContain('Inbox clear')
    expect(sendArgs.body).toContain('Window: 15 Apr – 22 Apr')
    expect(persistSnapshot).not.toHaveBeenCalled()
  })

  it('sends top-20 with overflow footer when >20 items', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: `uuid-${i}`, subject: `Item ${i}`, fromName: null, fromAddress: 'x@y', gmailMessageId: `gmail-${i}`,
    }))
    await sendDigest({ recipient: '+61412408587', items: many, dateLabel: '2026-04-22', stats: { ...STATS, actionableCount: 25 } })
    const sendArgs = (vi.mocked(sendMessage)).mock.calls[0][0] as Record<string, unknown>
    expect(sendArgs.body).toContain('+5 more')
    const positionsArg = (vi.mocked(persistSnapshot)).mock.calls[0][0] as Record<string, unknown>
    const positions = positionsArg.positions as Array<unknown>
    expect(positions).toHaveLength(20)
    expect(positions[0]).toEqual({ pos: 1, emailId: 'uuid-0' })
    expect(positions[19]).toEqual({ pos: 20, emailId: 'uuid-19' })
  })
})
