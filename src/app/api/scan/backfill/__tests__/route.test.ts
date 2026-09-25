import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ auth: vi.fn(), accounts: [] as unknown[], estimateBackfill: vi.fn(), runBackfillChunk: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: h.auth }))
vi.mock('@/lib/db', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => h.accounts }) }) }) } }))
vi.mock('@/lib/scan/backfill', async (orig) => ({
  ...(await orig<typeof import('@/lib/scan/backfill')>()),
  estimateBackfill: h.estimateBackfill,
  runBackfillChunk: h.runBackfillChunk,
}))

import { POST } from '../route'
import { GET } from '../estimate/route'

const est = (q = 'from=2026-09-05T00:00:00%2B10:00&to=2026-09-25T00:00:00%2B10:00') =>
  GET(new NextRequest(`http://localhost/api/scan/backfill/estimate?${q}`))
const run = (body: unknown = { from: '2026-09-05T00:00:00+10:00', to: '2026-09-25T00:00:00+10:00' }) =>
  POST(new NextRequest('http://localhost/api/scan/backfill', { method: 'POST', body: JSON.stringify(body) }))

/** A gaxios-shaped failure carrying secrets in its request config. */
const leaky = () => Object.assign(new Error('invalid_grant'), {
  response: { status: 400, data: { error: 'invalid_grant' } },
  config: { data: { refresh_token: 'SECRET-REFRESH', client_secret: 'SECRET-CLIENT' } },
})

beforeEach(() => {
  vi.clearAllMocks()
  h.auth.mockResolvedValue({ user: { id: 'u1', role: 'admin' } })
  h.accounts = [{ id: 'acc-1' }]
  h.estimateBackfill.mockResolvedValue({ unscanned: 10, estCostUsd: 0.01, chunks: 1, truncated: false })
  h.runBackfillChunk.mockResolvedValue({ processed: 10, saved: 10, actionable: 1, remaining: 0, stalled: false })
})

describe('/api/scan/backfill', () => {
  it('403 for non-admins on both endpoints', async () => {
    h.auth.mockResolvedValue({ user: { id: 'u1', role: 'member' } })
    expect((await est()).status).toBe(403)
    expect((await run()).status).toBe(403)
  })

  it('GET /estimate returns the estimate without running anything', async () => {
    const res = await est()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ unscanned: 10, estCostUsd: 0.01 })
    expect(h.runBackfillChunk).not.toHaveBeenCalled()
  })

  it('POST runs one chunk and returns remaining', async () => {
    const res = await run()
    expect(await res.json()).toMatchObject({ processed: 10, remaining: 0, stalled: false })
  })

  it('400 on an invalid range', async () => {
    expect((await est('from=2026-09-25&to=2026-09-05')).status).toBe(400)
  })

  it('404 when no Gmail account is connected', async () => {
    h.accounts = []
    expect((await est()).status).toBe(404)
  })

  it('AC-006 — a Gmail failure returns 502 and never logs the raw error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.estimateBackfill.mockRejectedValue(leaky())
    h.runBackfillChunk.mockRejectedValue(leaky())

    const a = await est()
    const b = await run()
    expect(a.status).toBe(502)
    expect(b.status).toBe(502)
    expect((await a.json()).error).toMatch(/invalid_grant/)

    const logged = spy.mock.calls.flat().map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n')
    expect(logged).not.toContain('SECRET-REFRESH')
    expect(logged).not.toContain('SECRET-CLIENT')
    spy.mockRestore()
  })
})
