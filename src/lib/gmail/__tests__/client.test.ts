import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Covers AC-006 (TC-007 / TC-008), plus the error-preservation behaviour AC-004
 * and AC-005 depend on.
 *
 * Two distinct failures are in scope:
 *   1. The proactive refresh only fires when `tokenExpiry` says the token is stale.
 *      A token Google has invalidated out-of-band still looks fresh, so the call
 *      goes out and comes back 401 with no retry.
 *   2. A failed refresh used to be replaced with an opaque "please reconnect"
 *      Error, destroying the `invalid_client` / `invalid_grant` distinction the
 *      operator needs. The original error must survive.
 */

const h = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  refreshAccessToken: vi.fn(),
  setCredentials: vi.fn(),
  gmailFactory: vi.fn(),
}))

vi.mock('googleapis', () => {
  class OAuth2 {
    setCredentials = h.setCredentials
    refreshAccessToken = h.refreshAccessToken
  }
  return {
    google: {
      auth: { OAuth2 },
      gmail: (...args: unknown[]) => {
        h.gmailFactory(...args)
        return { users: { messages: { list: h.list, get: h.get } } }
      },
    },
  }
})

import { fetchEmails, fetchUnscannedEmails, selectUnscanned } from '../client'

const unauthorized = () =>
  Object.assign(new Error('Invalid Credentials'), {
    response: { status: 401, data: { error: 'invalid_credentials' } },
  })

const validToken = {
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
  // Deliberately far in the future: the proactive check will NOT fire, which is
  // exactly the blind spot this feature closes.
  tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
}

beforeEach(() => {
  vi.clearAllMocks()
  h.refreshAccessToken.mockResolvedValue({ credentials: { access_token: 'fresh-tok' } })
  h.list.mockResolvedValue({ data: { messages: [] } })
})

describe('fetchEmails — reactive refresh on 401 (AC-006)', () => {
  it('TC-007 — a 401 triggers exactly one refresh-and-retry, and the call succeeds', async () => {
    h.list.mockRejectedValueOnce(unauthorized()).mockResolvedValueOnce({ data: { messages: [] } })

    const result = await fetchEmails(validToken, 'after:2026/8/1', 10)

    expect(h.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(h.list).toHaveBeenCalledTimes(2)
    expect(result.emails).toEqual([])
    // The caller must persist the token it just minted.
    expect(result.newAccessToken).toBe('fresh-tok')
  })

  it('TC-008 — a second consecutive 401 surfaces the error instead of looping', async () => {
    h.list.mockRejectedValue(unauthorized())

    await expect(fetchEmails(validToken, 'q', 10)).rejects.toThrow()

    expect(h.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(h.list).toHaveBeenCalledTimes(2)
  })

  it('does not attempt a reactive refresh when there is no refresh token', async () => {
    h.list.mockRejectedValue(unauthorized())

    await expect(
      fetchEmails({ ...validToken, refreshToken: null }, 'q', 10),
    ).rejects.toThrow()

    expect(h.refreshAccessToken).not.toHaveBeenCalled()
    expect(h.list).toHaveBeenCalledTimes(1)
  })

  it('does not retry a non-401 failure', async () => {
    h.list.mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 500 } }))

    await expect(fetchEmails(validToken, 'q', 10)).rejects.toThrow('boom')

    expect(h.refreshAccessToken).not.toHaveBeenCalled()
    expect(h.list).toHaveBeenCalledTimes(1)
  })
})

describe('fetchEmails — refresh failures preserve the original error', () => {
  it('propagates invalid_client rather than an opaque reconnect message', async () => {
    const expired = { ...validToken, tokenExpiry: new Date(Date.now() - 1000) }
    h.refreshAccessToken.mockRejectedValue(
      Object.assign(new Error('invalid_client'), {
        response: { status: 401, data: { error: 'invalid_client' } },
      }),
    )

    // The thrown value must still carry the OAuth error code, so that
    // classifyScanError can tell the operator to replace the secret.
    await expect(fetchEmails(expired, 'q', 10)).rejects.toMatchObject({
      response: { data: { error: 'invalid_client' } },
    })
  })

  it('propagates invalid_grant with its code intact', async () => {
    const expired = { ...validToken, tokenExpiry: new Date(Date.now() - 1000) }
    h.refreshAccessToken.mockRejectedValue(
      Object.assign(new Error('invalid_grant'), {
        response: { status: 400, data: { error: 'invalid_grant' } },
      }),
    )

    await expect(fetchEmails(expired, 'q', 10)).rejects.toMatchObject({
      response: { data: { error: 'invalid_grant' } },
    })
  })

  it('still refreshes proactively when the token is already expired', async () => {
    const expired = { ...validToken, tokenExpiry: new Date(Date.now() - 1000) }

    const result = await fetchEmails(expired, 'q', 10)

    expect(h.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(result.newAccessToken).toBe('fresh-tok')
    expect(h.list).toHaveBeenCalledTimes(1)
  })
})

/**
 * TC-006 (AC-006) — the raw gaxios error carries the refresh token in its request
 * body. It was logged verbatim, which put a live Gmail credential into Vercel logs.
 */
describe('token refresh failure logging (AC-006)', () => {
  it('TC-006 — logs the failure without the refresh token, access token or config', async () => {
    const leaky = Object.assign(new Error('invalid_grant'), {
      response: { status: 400, data: { error: 'invalid_grant' } },
      config: { data: { refresh_token: 'SECRET-REFRESH-123', client_secret: 'SECRET-CLIENT' } },
    })
    h.refreshAccessToken.mockRejectedValue(leaky)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(fetchEmails({ ...validToken, tokenExpiry: new Date(0) }, 'q')).rejects.toBe(leaky)

    const logged = spy.mock.calls.map((c) => c.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' ')).join('\n')
    expect(logged).toContain('invalid_grant')
    expect(logged).not.toContain('SECRET-REFRESH-123')
    expect(logged).not.toContain('SECRET-CLIENT')
    expect(logged).not.toContain('refresh-tok')
    spy.mockRestore()
  })
})

/**
 * TC-011 (AC-010, AC-011) — the scan used to take Gmail's newest 100 and drop
 * known ones afterwards, so any gap longer than ~1.5 days of mail was never reached.
 */
describe('selectUnscanned', () => {
  it('TC-011 — drops known ids first, then takes the oldest unscanned up to the cap', () => {
    // Gmail lists newest first: n150 … n1
    const ids = Array.from({ length: 150 }, (_, i) => `n${150 - i}`)
    const known = new Set(ids.slice(0, 100)) // the newest 100 are already scanned
    const r = selectUnscanned(ids, known, 30)
    expect(r.unscannedCount).toBe(50)
    expect(r.alreadyScanned).toBe(100)
    expect(r.batch).toHaveLength(30)
    expect(r.batch[0]).toBe('n1') // oldest first
    expect(r.remaining).toBe(20)
  })
})

describe('fetchUnscannedEmails', () => {
  const msg = (id: string) => ({ data: { id, threadId: `t${id}`, labelIds: [], snippet: '', payload: { headers: [{ name: 'Subject', value: id }] } } })

  it('pages through the whole window, filters known ids and fetches only the batch', async () => {
    h.list
      .mockResolvedValueOnce({ data: { messages: [{ id: 'c' }, { id: 'b' }], nextPageToken: 'p2' } })
      .mockResolvedValueOnce({ data: { messages: [{ id: 'a' }] } })
    h.get.mockImplementation(({ id }: { id: string }) => Promise.resolve(msg(id)))
    const filterKnown = vi.fn().mockResolvedValue(new Set(['c']))

    const r = await fetchUnscannedEmails(validToken, 'after:1', { maxEmails: 1, filterKnown })

    expect(h.list).toHaveBeenCalledTimes(2)
    expect(h.list.mock.calls[1][0].pageToken).toBe('p2')
    expect(filterKnown).toHaveBeenCalledWith(['c', 'b', 'a'])
    expect(r.emails.map((e) => e.messageId)).toEqual(['a'])
    expect(r).toMatchObject({ totalInWindow: 3, alreadyScanned: 1, remaining: 1 })
    expect(h.get).toHaveBeenCalledTimes(1)
  })

  it('refreshes once on a 401 from the list call', async () => {
    h.list.mockRejectedValueOnce(unauthorized()).mockResolvedValueOnce({ data: { messages: [] } })
    const r = await fetchUnscannedEmails(validToken, 'q', { maxEmails: 10, filterKnown: async () => new Set() })
    expect(h.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(r.newAccessToken).toBe('fresh-tok')
  })
})
