import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/scan/run-scan', () => ({ runScanForAccount: vi.fn() }))
vi.mock('@/lib/whatsapp/digest-sender', () => ({ sendDigest: vi.fn() }))
vi.mock('@/lib/whatsapp/ops-alert', () => ({ sendOpsAlert: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/scan/priority-score', () => ({
  scoreEmail: vi.fn().mockImplementation((e: any) => (e?.subject?.includes('due') ? 5 : 1)),
}))

import { GET, digestCutoff, DIGEST_MAX_AGE_DAYS } from '../route'
import { runScanForAccount } from '@/lib/scan/run-scan'
import { sendDigest } from '@/lib/whatsapp/digest-sender'
import { sendOpsAlert } from '@/lib/whatsapp/ops-alert'
import { db } from '@/lib/db'

function makeReq(headers: Record<string, string>) {
  return new NextRequest(new Request('http://localhost/api/cron/digest', {
    method: 'GET',
    headers,
  }))
}

describe('GET /api/cron/digest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    process.env.WHATSAPP_ALLOWED_NUMBERS = '+61412408587,+61402149544'
    ;(runScanForAccount as any).mockResolvedValue({
      scanRunId: 'run-1',
      actionable: 2,
      informational: 0,
      noise: 0,
      skipped: 0,
      totalEmails: 10,
      newEmails: 4,
      alreadyScanned: 6,
      windowFrom: new Date('2026-04-15T00:00:00Z'),
      windowTo: new Date('2026-04-22T00:00:00Z'),
    })
  })

  it('returns 401 when Authorization header missing', async () => {
    const res = await GET(makeReq({}))
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization does not match CRON_SECRET', async () => {
    const res = await GET(makeReq({ authorization: 'Bearer wrong' }))
    expect(res.status).toBe(401)
  })

  it('runs scan and sends digest to each allowlisted recipient', async () => {
    // Mock db.select().from(gmailAccounts) — no where clause, returns array directly
    const mockSelectChain = {
      from: vi.fn().mockResolvedValue([
        { id: 'acc-1', email: 'test@gmail.com' },
      ]),
    }
    ;(db as any).select = vi.fn().mockReturnValue(mockSelectChain)

    // Mock db.select(...fields).from(emailsScanned).where(...) for emails query
    const mockEmailSelectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: 'e1',
            messageId: 'm1',
            subject: 'Bill due 25 Apr',
            fromName: 'AGL',
            fromAddress: 'a@b',
            date: new Date(),
            rawSnippet: '$240',
          },
          {
            id: 'e2',
            messageId: 'm2',
            subject: 'Newsletter',
            fromName: null,
            fromAddress: 'x@y',
            date: new Date(),
            rawSnippet: 'hi',
          },
        ]),
      }),
    }

    // Override select to distinguish between calls with/without field parameter
    const origSelect = (db as any).select
    ;(db as any).select = vi.fn((fields?: any) => {
      if (fields) {
        // select with fields = emailsScanned query
        return mockEmailSelectChain
      }
      // select without fields = gmailAccounts query
      return mockSelectChain
    })

    const res = await GET(makeReq({ authorization: 'Bearer test-secret' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.sent).toBeGreaterThanOrEqual(1)
    expect(data.sent).toBeLessThanOrEqual(2) // max 2 recipients in allowlist
    expect(sendDigest).toHaveBeenCalled()
  })

  /**
   * Replaces an earlier test that asserted "scan failure is non-fatal — digest
   * still sends from existing DB state". That behaviour was the bug: for four
   * months the digest kept arriving, built from stale data, while nothing had
   * been scanned. A digest that cannot be trusted must not be sent. See DEC-2.
   */
  it('TC-018 — all accounts failed: sends no digest and exactly one ops alert', async () => {
    ;(runScanForAccount as any).mockRejectedValue(
      Object.assign(new Error('invalid_client'), {
        response: { status: 401, data: { error: 'invalid_client' } },
      }),
    )
    ;(db as any).select = vi.fn((fields?: any) => {
      if (fields) {
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }
      }
      return {
        from: vi.fn().mockResolvedValue([
          { id: 'acc-1', email: 'mboctor@gmail.com', lastScanAt: new Date('2026-05-02T03:01:10Z') },
        ]),
      }
    })

    const res = await GET(makeReq({ authorization: 'Bearer test-secret' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(sendDigest).not.toHaveBeenCalled()
    expect(data.sent).toBe(0)
    expect(data.suppressed).toBe(true)
    expect(data.scanErrors).toBe(1)

    // AC-011: exactly one alert, and sendOpsAlert itself targets the ops number only.
    expect(sendOpsAlert).toHaveBeenCalledTimes(1)
    const reports = (sendOpsAlert as any).mock.calls[0][0]
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ email: 'mboctor@gmail.com', errorCode: 'invalid_client' })
    expect(reports[0].lastSuccessfulScan).toEqual(new Date('2026-05-02T03:01:10Z'))
  })

  it('TC-019 — a successful scan still sends the digest to every recipient', async () => {
    ;(db as any).select = vi.fn((fields?: any) => {
      if (fields) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 'e1',
                messageId: 'm1',
                subject: 'Bill due',
                fromName: 'AGL',
                fromAddress: 'a@b',
                date: new Date(),
                rawSnippet: '$240',
              },
            ]),
          }),
        }
      }
      return { from: vi.fn().mockResolvedValue([{ id: 'acc-1', email: 'a@b.com', lastScanAt: new Date() }]) }
    })

    const res = await GET(makeReq({ authorization: 'Bearer test-secret' }))
    const data = await res.json()

    expect(data.sent).toBe(2)
    expect(data.suppressed).toBe(false)
    expect(sendDigest).toHaveBeenCalledTimes(2)
    expect(sendOpsAlert).not.toHaveBeenCalled()
  })

  it('partial failure: still sends the digest but also alerts the operator', async () => {
    // One account works, one does not — the working account's mail is still worth
    // sending, and the broken one still needs to be reported.
    ;(runScanForAccount as any)
      .mockResolvedValueOnce({
        scanRunId: 'r1', actionable: 1, informational: 0, noise: 0, skipped: 0,
        totalEmails: 5, newEmails: 2, alreadyScanned: 3,
        windowFrom: new Date('2026-08-22T00:00:00Z'), windowTo: new Date('2026-08-29T00:00:00Z'),
      })
      .mockRejectedValueOnce(new Error('invalid_grant'))
    ;(db as any).select = vi.fn((fields?: any) => {
      if (fields) {
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }
      }
      return {
        from: vi.fn().mockResolvedValue([
          { id: 'acc-1', email: 'ok@gmail.com', lastScanAt: new Date() },
          { id: 'acc-2', email: 'broken@gmail.com', lastScanAt: null },
        ]),
      }
    })

    const res = await GET(makeReq({ authorization: 'Bearer test-secret' }))
    const data = await res.json()

    expect(data.suppressed).toBe(false)
    expect(sendDigest).toHaveBeenCalledTimes(2)
    expect(sendOpsAlert).toHaveBeenCalledTimes(1)
    expect((sendOpsAlert as any).mock.calls[0][0][0].email).toBe('broken@gmail.com')
  })

  it('returns 200 with skipped=1 when no recipients configured', async () => {
    process.env.WHATSAPP_ALLOWED_NUMBERS = ''
    ;(db as any).select = vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([]),
    })

    const res = await GET(makeReq({ authorization: 'Bearer test-secret' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.skipped).toBe(1)
    expect(data.sent).toBe(0)
  })

  /**
   * AC-001 / AC-002 — the digest must agree with the scanner about what "current"
   * means. Before this, any untriaged row resurfaced in every digest forever: the
   * first digest after the 2026-08-30 outage recovery carried three 2026-04-29/30
   * emails as if they were news.
   */
  describe('age cap (DEC-1: 7 days on emails_scanned.date)', () => {
    it('TC-001 — digestCutoff is exactly DIGEST_MAX_AGE_DAYS before now, inclusive', () => {
      expect(DIGEST_MAX_AGE_DAYS).toBe(7)
      const now = new Date('2026-08-30T20:00:00.000Z')
      const cutoff = digestCutoff(now)
      expect(cutoff.toISOString()).toBe('2026-08-23T20:00:00.000Z')

      // The bound is `gte`, so an email dated exactly at the cutoff survives and
      // one a millisecond older does not. Stated here because the boundary is the
      // whole behaviour: off by one direction and a 7-day window silently becomes 6.
      const exactlySevenDaysOld = new Date('2026-08-23T20:00:00.000Z')
      const aMillisecondOlder = new Date('2026-08-23T19:59:59.999Z')
      expect(exactlySevenDaysOld.getTime() >= cutoff.getTime()).toBe(true)
      expect(aMillisecondOlder.getTime() >= cutoff.getTime()).toBe(false)
    })

    it('TC-002 — the digest query is bound by the cutoff date', async () => {
      const whereSpy = vi.fn().mockResolvedValue([])
      Object.assign(db, {
        select: vi.fn((fields?: unknown) => {
          if (fields) return { from: vi.fn().mockReturnValue({ where: whereSpy }) }
          return { from: vi.fn().mockResolvedValue([{ id: 'acc-1', email: 'test@gmail.com' }]) }
        }),
      })

      const before = Date.now()
      await GET(makeReq({ authorization: 'Bearer test-secret' }))
      const after = Date.now()

      expect(whereSpy).toHaveBeenCalledTimes(1)

      // Pull every bound parameter out of the drizzle condition tree and look for
      // the date lower bound. Asserting on the value rather than the SQL string
      // keeps this from breaking when drizzle changes its chunk formatting.
      const dates: Date[] = []
      const walk = (node: unknown, depth = 0): void => {
        if (!node || depth > 8) return
        if (node instanceof Date) return void dates.push(node)
        if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1))
        if (typeof node === 'object') {
          const rec = node as Record<string, unknown>
          for (const key of ['queryChunks', 'value', 'left', 'right', 'params']) {
            if (key in rec) walk(rec[key], depth + 1)
          }
        }
      }
      walk(whereSpy.mock.calls[0][0])

      expect(dates).toHaveLength(1)
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
      expect(dates[0].getTime()).toBeGreaterThanOrEqual(before - sevenDaysMs - 1000)
      expect(dates[0].getTime()).toBeLessThanOrEqual(after - sevenDaysMs + 1000)
    })
  })
})
