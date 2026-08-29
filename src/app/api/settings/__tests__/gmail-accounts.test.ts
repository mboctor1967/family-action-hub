import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Covers AC-012 (TC-013).
 *
 * Health is derived server-side so the script, the API and the UI cannot drift
 * apart on what "healthy" means. The staleness half of the rule matters most:
 * an account with no recorded error is NOT necessarily healthy — it may simply
 * never have had a failure written down, which is how a four-month outage
 * rendered as a green "Connected" badge.
 */

const h = vi.hoisted(() => ({ auth: vi.fn(), rows: [] as unknown[] }))

vi.mock('@/lib/auth', () => ({ auth: h.auth }))
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => Promise.resolve(h.rows) }) },
}))

import { GET } from '../gmail-accounts/route'

const hoursAgo = (n: number) => new Date(Date.now() - n * 3600 * 1000)

const account = (over: Record<string, unknown> = {}) => ({
  id: 'acc-1',
  email: 'mboctor@gmail.com',
  lastScanAt: hoursAgo(6),
  lastError: null,
  lastErrorCode: null,
  lastErrorAt: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  h.auth.mockResolvedValue({ user: { id: 'user-1', role: 'admin' } })
  h.rows = []
})

describe('GET /api/settings/gmail-accounts', () => {
  it('returns 401 when unauthenticated', async () => {
    h.auth.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it('TC-013 — exposes the health fields alongside the account', async () => {
    h.rows = [account()]
    const body = await (await GET()).json()

    expect(body[0]).toMatchObject({
      email: 'mboctor@gmail.com',
      health: 'healthy',
      lastError: null,
      lastErrorCode: null,
    })
    expect(body[0]).toHaveProperty('lastScanAt')
    expect(body[0]).toHaveProperty('healthReason')
  })

  it('reports needs_attention when an error code is recorded', async () => {
    h.rows = [account({ lastErrorCode: 'invalid_client', lastError: 'secret is invalid', lastErrorAt: hoursAgo(1) })]
    const body = await (await GET()).json()

    expect(body[0].health).toBe('needs_attention')
    expect(body[0].healthReason).toMatch(/secret is invalid/i)
  })

  it('reports needs_attention on a stale account even with no recorded error', async () => {
    // The four-month outage in one assertion: no error code, yet plainly broken.
    h.rows = [account({ lastScanAt: hoursAgo(24 * 119) })]
    const body = await (await GET()).json()

    expect(body[0].health).toBe('needs_attention')
    expect(body[0].healthReason).toMatch(/no successful scan/i)
  })

  it('reports needs_attention when the account has never scanned', async () => {
    h.rows = [account({ lastScanAt: null })]
    const body = await (await GET()).json()

    expect(body[0].health).toBe('needs_attention')
    expect(body[0].healthReason).toMatch(/never/i)
  })

  it('stays healthy at 47h and tips over at 49h', async () => {
    h.rows = [account({ lastScanAt: hoursAgo(47) })]
    expect((await (await GET()).json())[0].health).toBe('healthy')

    h.rows = [account({ lastScanAt: hoursAgo(49) })]
    expect((await (await GET()).json())[0].health).toBe('needs_attention')
  })
})
