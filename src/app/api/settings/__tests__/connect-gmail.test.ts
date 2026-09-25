import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * TC-009 (AC-009). "Reconnect Gmail" copies the token Auth.js stored at the last
 * sign-in; it never talks to Google. On 2026-09-25 pressing it without a fresh
 * sign-in re-saved a revoked token and reported success. It must prove the token
 * works before saving it.
 */

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  googleRows: [] as unknown[],
  existingRows: [] as unknown[],
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  createGmailClient: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: h.auth }))
vi.mock('@/lib/gmail/client', () => ({
  createGmailClient: h.createGmailClient,
  describeErrorForLog: (e: unknown) => String((e as Error)?.message ?? e),
}))
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  return {
    db: {
      // Auth.js `accounts` holds the sign-in token; `gmail_accounts` is the scanner's copy.
      select: () => ({ from: (t: unknown) => ({ where: () => ({ limit: async () => (t === schema.accounts ? h.googleRows : h.existingRows) }) }) }),
      update: () => ({ set: (v: Record<string, unknown>) => ({ where: async () => { h.updates.push(v) } }) }),
      insert: () => ({ values: async (v: Record<string, unknown>) => { h.inserts.push(v) } }),
    },
  }
})

import { POST } from '../connect-gmail/route'

const googleRow = { access_token: 'acc', refresh_token: 'ref', expires_at: 1790000000 }
const oauthError = (code: string) => Object.assign(new Error(code), { response: { status: 400, data: { error: code } } })

beforeEach(() => {
  vi.clearAllMocks()
  h.updates = []
  h.inserts = []
  h.auth.mockResolvedValue({ user: { id: 'u1', email: 'mboctor@gmail.com' } })
  h.googleRows = [googleRow]
  h.existingRows = [{ id: 'g1' }]
  h.createGmailClient.mockResolvedValue({ gmail: {}, newAccessToken: 'fresh-access' })
})

describe('POST /api/settings/connect-gmail', () => {
  it('test-refreshes the stored token and saves it when Google accepts it', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    expect(h.createGmailClient).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: 'ref' }), true)
    expect(h.updates[0]).toMatchObject({ accessToken: 'fresh-access', refreshToken: 'ref' })
  })

  it('TC-009 — on invalid_grant returns 409 with the sign-out instruction and saves nothing', async () => {
    h.createGmailClient.mockRejectedValue(oauthError('invalid_grant'))
    const res = await POST()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/sign out.*sign in/i)
    expect(h.updates).toHaveLength(0)
    expect(h.inserts).toHaveLength(0)
  })

  it('on invalid_client explains that reconnecting cannot help', async () => {
    h.createGmailClient.mockRejectedValue(oauthError('invalid_client'))
    const res = await POST()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/GOOGLE_CLIENT_SECRET/)
    expect(h.updates).toHaveLength(0)
  })

  it('returns 400 when the sign-in stored no refresh token', async () => {
    h.googleRows = [{ ...googleRow, refresh_token: null }]
    const res = await POST()
    expect(res.status).toBe(400)
    expect(h.createGmailClient).not.toHaveBeenCalled()
  })

  it('returns 502 on a transient failure and saves nothing', async () => {
    h.createGmailClient.mockRejectedValue(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))
    const res = await POST()
    expect(res.status).toBe(502)
    expect(h.updates).toHaveLength(0)
  })

  it('inserts a new gmail_accounts row on first connect', async () => {
    h.existingRows = []
    const res = await POST()
    expect(res.status).toBe(200)
    expect(h.inserts[0]).toMatchObject({ email: 'mboctor@gmail.com', accessToken: 'fresh-access', refreshToken: 'ref' })
  })
})
