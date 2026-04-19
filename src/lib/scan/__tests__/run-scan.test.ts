import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock db
vi.mock('@/lib/db', () => ({ db: {} }))

// Mock gmail client — match real signatures from src/lib/gmail/client.ts
vi.mock('@/lib/gmail/client', () => ({
  fetchEmails: vi.fn(),
  preFilterEmails: vi.fn(),
}))

// Mock AI classify — match real signature: classifyEmails(emails, skillPrompt, topicNames)
vi.mock('@/lib/ai/classify', () => ({ classifyEmails: vi.fn() }))

// Mock build-prompt — returns a string
vi.mock('@/lib/ai/build-prompt', () => ({
  buildClassificationPrompt: vi.fn().mockReturnValue('prompt'),
}))

import { runScanForAccount } from '../run-scan'
import { fetchEmails, preFilterEmails } from '@/lib/gmail/client'
import { classifyEmails } from '@/lib/ai/classify'
import { db } from '@/lib/db'

// Helper to build a mock email matching EmailMetadata shape
const makeEmail = (id: string) => ({
  messageId: id,
  threadId: `t${id}`,
  from: 'Sender <sender@example.com>',
  fromAddress: 'sender@example.com',
  fromName: 'Sender',
  to: 'me@example.com',
  subject: `Subject ${id}`,
  date: '2026-04-19',
  snippet: 'snippet',
  body: 'body text',
  labels: ['INBOX'],
})

const makeClassification = (messageId: string) => ({
  messageId,
  classification: 'actionable' as const,
  confidence: 0.9,
  action_summary: 'Do something',
  suggested_assignee: 'Maged',
  suggested_topic: 'Finance',
  urgency: 'medium' as const,
  due_date: null,
  reasoning: 'It is important',
})

function buildMockDb() {
  // Track which operations are called
  const updateMock = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  })

  const deleteMock = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  })

  const insertMock = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'scan-run-1' }]),
    }),
  })

  // select chain: .from().where().limit()  or .from()
  const limitMock = vi.fn().mockResolvedValue([{
    id: 'acc-1',
    userId: 'user-1',
    accessToken: 'tok',
    refreshToken: 'refresh',
    tokenExpiry: null,
  }])
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock })
  const fromMock = vi.fn().mockReturnValue({ where: whereMock })
  const selectMock = vi.fn().mockReturnValue({ from: fromMock })

  return { update: updateMock, delete: deleteMock, insert: insertMock, select: selectMock }
}

describe('runScanForAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const email = makeEmail('m1')
    vi.mocked(fetchEmails).mockResolvedValue({
      emails: [email],
      newAccessToken: undefined,
    })
    vi.mocked(preFilterEmails).mockReturnValue([email])
    vi.mocked(classifyEmails).mockResolvedValue([makeClassification('m1')])
  })

  it('returns counts and scanRunId on happy path', async () => {
    const mockDb = buildMockDb()
    const accountRow = { id: 'acc-1', accessToken: 'tok', refreshToken: null, tokenExpiry: null }

    // select call 1: account lookup — .from().where().limit()
    const accountSelect = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([accountRow]),
        }),
      }),
    }
    // select call 2: existingEmails — .from().where() resolves array
    const existingSelect = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }
    // select call 3: topics — .from() resolves array directly
    const topicsSelect = {
      from: vi.fn().mockResolvedValue([{ name: 'Finance' }]),
    }

    mockDb.select
      .mockReturnValueOnce(accountSelect)
      .mockReturnValueOnce(existingSelect)
      .mockReturnValueOnce(topicsSelect)

    Object.assign(db as unknown as Record<string, unknown>, mockDb)

    const result = await runScanForAccount('acc-1')

    expect(result.scanRunId).toBe('scan-run-1')
    expect(result.actionable).toBe(1)
    expect(typeof result.informational).toBe('number')
    expect(typeof result.noise).toBe('number')
    expect(typeof result.skipped).toBe('number')
  })

  it('calls progress callback at each stage when provided', async () => {
    const progress = vi.fn()

    const mockDb = buildMockDb()
    const accountRow = { id: 'acc-1', accessToken: 'tok', refreshToken: null, tokenExpiry: null }

    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([accountRow]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockResolvedValue([{ name: 'Finance' }]),
      })

    Object.assign(db as unknown as Record<string, unknown>, mockDb)

    await runScanForAccount('acc-1', { onProgress: progress })

    expect(progress).toHaveBeenCalled()
    const events = progress.mock.calls.map((c: unknown[]) => (c[0] as { event: string })?.event)
    expect(events).toContain('progress')
  })

  it('returns skipped count when no new emails exist', async () => {
    // existingEmails already has m1, so newEmails will be empty
    const mockDb = buildMockDb()
    const accountRow = { id: 'acc-1', accessToken: 'tok', refreshToken: null, tokenExpiry: null }

    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([accountRow]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ messageId: 'm1' }]),
        }),
      })

    // update for scan run completion
    mockDb.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) })

    Object.assign(db as unknown as Record<string, unknown>, mockDb)

    const result = await runScanForAccount('acc-1')

    expect(result.skipped).toBe(1)
    expect(result.actionable).toBe(0)
  })
})
