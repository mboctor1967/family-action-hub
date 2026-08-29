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

/**
 * Covers AC-001 / AC-002 / AC-003 (TC-004 / TC-005 / TC-006).
 *
 * Regression guard for the 2026-05 → 2026-08 outage: every nightly run threw at
 * the Gmail token step and left its scan_runs row stuck at 'running' forever, so
 * 159 failures accumulated without a single one being recorded as a failure.
 */
describe('runScanForAccount — failure recording', () => {
  /** Records every db.update(...).set(...) payload so we can assert on what was written. */
  function buildRecordingDb() {
    const updates: Record<string, unknown>[] = []
    const update = vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        updates.push(payload)
        return { where: vi.fn().mockResolvedValue([]) }
      }),
    }))
    const insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'scan-run-1' }]),
      }),
    })
    return { updates, update, insert, delete: vi.fn(), select: vi.fn() }
  }

  const accountRow = { id: 'acc-1', accessToken: 'tok', refreshToken: 'refresh', tokenExpiry: null }
  const accountSelect = () => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([accountRow]) }),
    }),
  })

  /** scan_runs writes carry `status`; gmail_accounts writes never do. */
  const runUpdates = (u: Record<string, unknown>[]) => u.filter((p) => 'status' in p)
  const accountUpdates = (u: Record<string, unknown>[]) =>
    u.filter((p) => 'lastError' in p || 'lastScanAt' in p)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(preFilterEmails).mockReturnValue([])
    vi.mocked(classifyEmails).mockResolvedValue([])
  })

  it('TC-004 — marks the scan run failed with an error_message when the scan throws', async () => {
    const mockDb = buildRecordingDb()
    mockDb.select.mockReturnValueOnce(accountSelect())
    vi.mocked(fetchEmails).mockRejectedValue(
      Object.assign(new Error('invalid_client'), {
        response: { status: 401, data: { error: 'invalid_client' } },
      }),
    )
    Object.assign(db as unknown as Record<string, unknown>, mockDb)

    await expect(runScanForAccount('acc-1')).rejects.toThrow()

    const failed = runUpdates(mockDb.updates).filter((p) => p.status === 'failed')
    expect(failed).toHaveLength(1)
    expect(failed[0].errorMessage).toEqual(expect.stringContaining('invalid_client'))
    expect(failed[0].completedAt).toBeInstanceOf(Date)
  })

  it('TC-005 — records last_error, last_error_code and last_error_at on the account', async () => {
    const mockDb = buildRecordingDb()
    mockDb.select.mockReturnValueOnce(accountSelect())
    vi.mocked(fetchEmails).mockRejectedValue(
      Object.assign(new Error('invalid_client'), {
        response: { status: 401, data: { error: 'invalid_client' } },
      }),
    )
    Object.assign(db as unknown as Record<string, unknown>, mockDb)

    await expect(runScanForAccount('acc-1')).rejects.toThrow()

    const acct = accountUpdates(mockDb.updates)
    expect(acct).toHaveLength(1)
    expect(acct[0].lastErrorCode).toBe('invalid_client')
    expect(acct[0].lastError).toEqual(expect.stringContaining('GOOGLE_CLIENT_SECRET'))
    expect(acct[0].lastErrorAt).toBeInstanceOf(Date)
    // A failed scan must never advance the "last successful scan" marker.
    expect(acct[0].lastScanAt).toBeUndefined()
  })

  it('rethrows so the caller can count the failure — never swallows', async () => {
    const mockDb = buildRecordingDb()
    mockDb.select.mockReturnValueOnce(accountSelect())
    vi.mocked(fetchEmails).mockRejectedValue(new Error('boom'))
    Object.assign(db as unknown as Record<string, unknown>, mockDb)

    await expect(runScanForAccount('acc-1')).rejects.toThrow('boom')
  })

  it('TC-006 — a successful scan clears the error fields and advances last_scan_at', async () => {
    const mockDb = buildRecordingDb()
    const email = makeEmail('m1')
    vi.mocked(fetchEmails).mockResolvedValue({ emails: [email], newAccessToken: undefined })
    vi.mocked(preFilterEmails).mockReturnValue([email])
    vi.mocked(classifyEmails).mockResolvedValue([makeClassification('m1')])

    mockDb.select
      .mockReturnValueOnce(accountSelect())
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) })
      .mockReturnValueOnce({ from: vi.fn().mockResolvedValue([{ name: 'Finance' }]) })
    Object.assign(db as unknown as Record<string, unknown>, mockDb)

    await runScanForAccount('acc-1')

    const acct = accountUpdates(mockDb.updates)
    expect(acct).toHaveLength(1)
    expect(acct[0].lastScanAt).toBeInstanceOf(Date)
    expect(acct[0].lastError).toBeNull()
    expect(acct[0].lastErrorCode).toBeNull()
    expect(acct[0].lastErrorAt).toBeNull()
  })

  it('treats a run that finds no new emails as a success — it reached Gmail', async () => {
    // Otherwise a run of quiet days would let "last successful scan" go stale in
    // Settings and look identical to a broken scanner.
    const mockDb = buildRecordingDb()
    const email = makeEmail('m1')
    vi.mocked(fetchEmails).mockResolvedValue({ emails: [email], newAccessToken: undefined })

    mockDb.select
      .mockReturnValueOnce(accountSelect())
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ messageId: 'm1' }]) }),
      })
    Object.assign(db as unknown as Record<string, unknown>, mockDb)

    const result = await runScanForAccount('acc-1')

    expect(result.newEmails).toBe(0)
    const acct = accountUpdates(mockDb.updates)
    expect(acct).toHaveLength(1)
    expect(acct[0].lastScanAt).toBeInstanceOf(Date)
    expect(acct[0].lastError).toBeNull()
  })
})
