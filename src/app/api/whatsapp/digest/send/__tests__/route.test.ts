import { describe, it, expect, vi, beforeEach } from 'vitest'

/** TC-008 (AC-008) — "Send digest now" runs the same pipeline as the cron, admin only. */

const h = vi.hoisted(() => ({ auth: vi.fn(), runDailyDigest: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: h.auth }))
vi.mock('@/lib/whatsapp/daily-digest', () => ({ runDailyDigest: h.runDailyDigest }))

import { POST } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
  h.runDailyDigest.mockResolvedValue({ sent: 2, failed: 0, skipped: 0, scanErrors: 0, suppressed: false })
})

describe('POST /api/whatsapp/digest/send', () => {
  it('401 without a session', async () => {
    h.auth.mockResolvedValue(null)
    expect((await POST()).status).toBe(401)
    expect(h.runDailyDigest).not.toHaveBeenCalled()
  })

  it('403 for a non-admin', async () => {
    h.auth.mockResolvedValue({ user: { id: 'u', role: 'member' } })
    expect((await POST()).status).toBe(403)
    expect(h.runDailyDigest).not.toHaveBeenCalled()
  })

  it('TC-008 — admin: runs the daily digest and returns its counts', async () => {
    h.auth.mockResolvedValue({ user: { id: 'u', role: 'admin' } })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ sent: 2, failed: 0 })
    expect(h.runDailyDigest).toHaveBeenCalledTimes(1)
  })
})
