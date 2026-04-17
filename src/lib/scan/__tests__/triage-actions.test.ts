import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock db before import
vi.mock('@/lib/db', () => {
  const mockFn = vi.fn()
  return {
    db: {
      select: mockFn,
      insert: mockFn,
      update: mockFn,
      transaction: vi.fn((cb) => cb({ select: mockFn, insert: mockFn, update: mockFn })),
    },
  }
})

vi.mock('@/lib/db/schema', () => ({
  emailsScanned: {},
  tasks: {},
  topics: {},
  profiles: {},
  aiFeedback: {},
}))

import { confirmEmailAsTask } from '../triage-actions'

vi.mock('fs', () => ({
  readFileSync: vi.fn(() => JSON.stringify({ user_feedback_rules: [] })),
  writeFileSync: vi.fn(),
}))

describe('confirmEmailAsTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when the email is not unreviewed', async () => {
    const tx: any = {
      select: vi.fn().mockReturnValue({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{
              id: 'e1',
              triageStatus: 'confirmed',
              aiSuggestions: null,
            }]),
          }),
        }),
      }),
    }
    await expect(
      confirmEmailAsTask(tx, 'e1', 'user-1')
    ).rejects.toThrow(/already triaged/i)
  })

  it('inserts task, updates triageStatus=confirmed, and records feedback', async () => {
    const insertValues = vi.fn().mockReturnValue({ returning: () => Promise.resolve([{ id: 'task-1' }]) })
    const updateSet = vi.fn().mockReturnValue({ where: () => Promise.resolve() })

    const tx: any = {
      select: vi.fn()
        // first select: the email
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({ limit: () => Promise.resolve([{
              id: 'e1',
              triageStatus: 'unreviewed',
              subject: 'Pay invoice',
              messageId: 'msg-1',
              rawSnippet: 'Please pay',
              aiSuggestions: JSON.stringify({ urgency: 'high', action_summary: 'Pay' }),
            }]) }),
          }),
        }),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    }

    const taskId = await confirmEmailAsTask(tx, 'e1', 'user-1')

    expect(taskId).toBe('task-1')
    expect(insertValues).toHaveBeenCalled()          // task insert
    expect(updateSet).toHaveBeenCalledWith({ triageStatus: 'confirmed' })
  })
})

describe('rejectEmail', () => {
  it('sets triageStatus=rejected and records feedback', async () => {
    const updateSet = vi.fn().mockReturnValue({ where: () => Promise.resolve() })
    const insertValues = vi.fn().mockResolvedValue(undefined)

    const tx: any = {
      select: vi.fn().mockReturnValue({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{
          id: 'e1',
          triageStatus: 'unreviewed',
          fromAddress: 'news@example.com',
          subject: 'Weekly digest',
        }]) }) }),
      }),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    }

    const { rejectEmail } = await import('../triage-actions')
    await rejectEmail(tx, 'e1')

    expect(updateSet).toHaveBeenCalledWith({ triageStatus: 'rejected' })
    expect(insertValues).toHaveBeenCalled()
  })
})
