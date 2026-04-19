import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/scan/run-scan', () => ({ runScanForAccount: vi.fn() }))
vi.mock('@/lib/whatsapp/digest-sender', () => ({ sendDigest: vi.fn() }))
vi.mock('@/lib/scan/priority-score', () => ({
  scoreEmail: vi.fn().mockImplementation((e: any) => (e?.subject?.includes('due') ? 5 : 1)),
}))

import { POST } from '../route'
import { runScanForAccount } from '@/lib/scan/run-scan'
import { sendDigest } from '@/lib/whatsapp/digest-sender'
import { db } from '@/lib/db'

function makeReq(headers: Record<string, string>) {
  return new NextRequest(new Request('http://localhost/api/cron/digest', {
    method: 'POST',
    headers,
  }))
}

describe('POST /api/cron/digest', () => {
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
    })
  })

  it('returns 401 when Authorization header missing', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization does not match CRON_SECRET', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer wrong' }))
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

    const res = await POST(makeReq({ authorization: 'Bearer test-secret' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.sent).toBeGreaterThanOrEqual(1)
    expect(data.sent).toBeLessThanOrEqual(2) // max 2 recipients in allowlist
    expect(sendDigest).toHaveBeenCalled()
  })

  it('scan failure is non-fatal — digest still sends from existing DB state', async () => {
    ;(runScanForAccount as any).mockRejectedValue(new Error('scan boom'))

    // Mock db.select(): plain call returns gmailAccounts list; field-select returns emails
    ;(db as any).select = vi.fn((fields?: any) => {
      if (fields) {
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }
      }
      return { from: vi.fn().mockResolvedValue([{ id: 'acc-1' }]) }
    })

    const res = await POST(makeReq({ authorization: 'Bearer test-secret' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    // Digest proceeds even though scan failed; sent to both recipients (with empty items).
    expect(data.sent).toBe(2)
    expect(data.failed).toBe(0)
    expect(sendDigest).toHaveBeenCalledTimes(2)
  })

  it('returns 200 with skipped=1 when no recipients configured', async () => {
    process.env.WHATSAPP_ALLOWED_NUMBERS = ''
    ;(db as any).select = vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([]),
    })

    const res = await POST(makeReq({ authorization: 'Bearer test-secret' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.skipped).toBe(1)
    expect(data.sent).toBe(0)
  })
})
