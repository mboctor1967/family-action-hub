import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/scan/triage-actions', () => ({
  confirmEmailAsTask: vi.fn(),
  rejectEmail: vi.fn(),
}))

import { handleDigestReply } from '../digest-reply-handler'
import { confirmEmailAsTask, rejectEmail } from '@/lib/scan/triage-actions'

type MockFn = { mockResolvedValue: (value: unknown) => MockFn; mockResolvedValueOnce: (value: unknown) => MockFn; mockRejectedValueOnce: (value: unknown) => MockFn }

describe('handleDigestReply', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const snapshot = {
    id: 'snap-1',
    recipient: '+61412408587',
    sentAt: new Date(),
    positions: [
      { pos: 1, emailId: 'e1' },
      { pos: 2, emailId: 'e2' },
      { pos: 3, emailId: 'e3' },
    ],
  }

  it('creates tasks for confirmed positions', async () => {
    ;(confirmEmailAsTask as unknown as MockFn).mockResolvedValue('new-task-id')

    const reply = await handleDigestReply({
      phone: '+61412408587',
      text: 'task 1,3',
      snapshot,
      fallbackUserId: 'user-maged',
    })

    expect(confirmEmailAsTask).toHaveBeenCalledTimes(2)
    expect(confirmEmailAsTask).toHaveBeenCalledWith(expect.anything(), 'e1', 'user-maged')
    expect(confirmEmailAsTask).toHaveBeenCalledWith(expect.anything(), 'e3', 'user-maged')
    expect(reply).toContain('2 tasks created')
  })

  it('rejects emails for reject positions', async () => {
    ;(rejectEmail as unknown as MockFn).mockResolvedValue(undefined)

    const reply = await handleDigestReply({
      phone: '+61412408587',
      text: 'reject 2',
      snapshot,
      fallbackUserId: 'user-maged',
    })

    expect(rejectEmail).toHaveBeenCalledWith(expect.anything(), 'e2')
    expect(reply).toContain('0 tasks created, 1 rejected')
  })

  it('handles mixed task + reject', async () => {
    ;(confirmEmailAsTask as unknown as MockFn).mockResolvedValue('tid')
    ;(rejectEmail as unknown as MockFn).mockResolvedValue(undefined)

    const reply = await handleDigestReply({
      phone: '+61412408587',
      text: 'task 1 reject 2,3',
      snapshot,
      fallbackUserId: 'user-maged',
    })

    expect(confirmEmailAsTask).toHaveBeenCalledTimes(1)
    expect(rejectEmail).toHaveBeenCalledTimes(2)
    expect(reply).toContain('1 tasks created, 2 rejected')
  })

  it('returns help when reply is "help"', async () => {
    const reply = await handleDigestReply({
      phone: '+61412408587',
      text: 'help',
      snapshot,
      fallbackUserId: 'user-maged',
    })
    expect(confirmEmailAsTask).not.toHaveBeenCalled()
    expect(rejectEmail).not.toHaveBeenCalled()
    expect(reply).toContain('task 1,3')
    expect(reply).toContain('Example:')
  })

  it('returns unrecognised when parser returns null', async () => {
    const reply = await handleDigestReply({
      phone: '+61412408587',
      text: 'blah blah',
      snapshot,
      fallbackUserId: 'user-maged',
    })
    expect(reply).toMatch(/didn'?t catch that/i)
  })

  it('counts failed positions when a helper throws', async () => {
    ;(confirmEmailAsTask as unknown as MockFn)
      .mockResolvedValueOnce('t1')
      .mockRejectedValueOnce(new Error('already triaged'))

    const reply = await handleDigestReply({
      phone: '+61412408587',
      text: 'task 1,2',
      snapshot,
      fallbackUserId: 'user-maged',
    })

    expect(reply).toContain('1 tasks created')
    expect(reply).toContain('1 failed')
  })

  it('reports out-of-range positions in reply', async () => {
    ;(confirmEmailAsTask as unknown as MockFn).mockResolvedValue('tid')

    const reply = await handleDigestReply({
      phone: '+61412408587',
      text: 'task 1,9',
      snapshot,
      fallbackUserId: 'user-maged',
    })

    expect(reply).toContain('Ignored out-of-range: 9')
  })
})
