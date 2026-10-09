import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * TC-003 — AC-007, AC-008, AC-009.
 *
 * The validation case is the one that matters: `parseChannel` deliberately coerces an
 * unreadable stored value to `both` so a corrupt setting can never mean silence. The
 * API must NOT do that — a user who picks a bad value should be told, not quietly
 * given a different channel from the one they chose.
 */

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  stored: 'both' as string,
  setSetting: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: h.auth }))
vi.mock('@/lib/app-settings', () => ({
  getSetting: vi.fn(async () => h.stored),
  setSetting: h.setSetting,
}))

import { GET, PUT } from '../digest-channel/route'

const put = (body: unknown) =>
  PUT(new Request('http://localhost/api/settings/digest-channel', {
    method: 'PUT',
    body: JSON.stringify(body),
  }) as never)

beforeEach(() => {
  vi.clearAllMocks()
  h.auth.mockResolvedValue({ user: { id: 'u1', role: 'admin', email: 'mboctor@gmail.com' } })
  h.stored = 'both'
})

describe('GET /api/settings/digest-channel', () => {
  it('returns the stored channel', async () => {
    h.stored = 'email'
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ channel: 'email' })
  })

  it('401 without a session', async () => {
    h.auth.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it('403 for a non-admin', async () => {
    h.auth.mockResolvedValue({ user: { id: 'u2', role: 'member' } })
    expect((await GET()).status).toBe(403)
  })
})

describe('PUT /api/settings/digest-channel', () => {
  it('accepts each valid channel and persists it', async () => {
    for (const channel of ['whatsapp', 'email', 'both']) {
      const res = await put({ channel })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ channel })
    }
    expect(h.setSetting).toHaveBeenCalledTimes(3)
  })

  it('rejects an invalid channel with 400 and writes nothing', async () => {
    for (const bad of ['sms', '', null, 42, undefined]) {
      const res = await put({ channel: bad })
      expect(res.status).toBe(400)
    }
    expect(h.setSetting).not.toHaveBeenCalled()
  })

  it('rejects a malformed body without throwing', async () => {
    const res = await PUT(new Request('http://localhost/api/settings/digest-channel', {
      method: 'PUT',
      body: 'not json',
    }) as never)
    expect(res.status).toBe(400)
    expect(h.setSetting).not.toHaveBeenCalled()
  })

  it('403 for a non-admin, and writes nothing', async () => {
    h.auth.mockResolvedValue({ user: { id: 'u2', role: 'member' } })
    expect((await put({ channel: 'email' })).status).toBe(403)
    expect(h.setSetting).not.toHaveBeenCalled()
  })

  it('records who made the change', async () => {
    await put({ channel: 'email' })
    expect(h.setSetting).toHaveBeenCalledWith('digest_channel', 'email', 'mboctor@gmail.com')
  })
})
