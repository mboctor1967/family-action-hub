import { describe, it, expect } from 'vitest'
import { classifyScanError } from '../scan-errors'

/**
 * Covers AC-004 / AC-005 (TC-002 / TC-003).
 *
 * The distinction matters operationally: `invalid_client` means the OAuth secret
 * was rotated away and reconnecting Gmail will NOT help — which is exactly the
 * misleading advice the old opaque error gave during the 2026-05 → 2026-08 outage.
 */

/** Shape googleapis/gaxios produces for an OAuth token endpoint rejection. */
function oauthError(error: string, status = 401) {
  return Object.assign(new Error(error), {
    response: { status, data: { error, error_description: `The provided ${error} is invalid.` } },
  })
}

describe('classifyScanError', () => {
  describe('TC-002 — invalid_client (AC-004)', () => {
    it('maps an invalid_client OAuth rejection to the invalid_client code', () => {
      expect(classifyScanError(oauthError('invalid_client')).code).toBe('invalid_client')
    })

    it('tells the operator to replace the secret, not to reconnect', () => {
      const { message, remedy } = classifyScanError(oauthError('invalid_client'))
      expect(remedy).toMatch(/GOOGLE_CLIENT_SECRET/)
      expect(message).toMatch(/GOOGLE_CLIENT_SECRET/)
      // The critical negative assertion — this is the advice that wasted four months.
      expect(message).toMatch(/reconnect(ing)? .*not (help|fix)/i)
    })

    it('detects invalid_client from a bare message when no response body is present', () => {
      expect(classifyScanError(new Error('invalid_client')).code).toBe('invalid_client')
    })
  })

  describe('TC-003 — invalid_grant (AC-005)', () => {
    it('maps an invalid_grant OAuth rejection to the invalid_grant code', () => {
      expect(classifyScanError(oauthError('invalid_grant', 400)).code).toBe('invalid_grant')
    })

    it('directs the user to reconnect in Settings', () => {
      const { message, remedy } = classifyScanError(oauthError('invalid_grant', 400))
      expect(remedy).toMatch(/reconnect/i)
      expect(remedy).toMatch(/settings/i)
      expect(message).toMatch(/reconnect/i)
    })
  })

  describe('transient', () => {
    it.each([500, 502, 503, 504, 429])('treats HTTP %i as transient', (status) => {
      const err = Object.assign(new Error('upstream'), { response: { status } })
      expect(classifyScanError(err).code).toBe('transient')
    })

    it.each(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'])(
      'treats network error %s as transient',
      (code) => {
        expect(classifyScanError(Object.assign(new Error('net'), { code })).code).toBe('transient')
      },
    )

    it('says the failure is expected to clear on the next run', () => {
      const err = Object.assign(new Error('upstream'), { response: { status: 503 } })
      expect(classifyScanError(err).remedy).toMatch(/next run/i)
    })
  })

  describe('unknown', () => {
    it('falls back to unknown and preserves the original message', () => {
      const result = classifyScanError(new Error('something entirely unexpected'))
      expect(result.code).toBe('unknown')
      expect(result.message).toContain('something entirely unexpected')
    })

    it('handles a non-Error throw without crashing', () => {
      const result = classifyScanError('just a string')
      expect(result.code).toBe('unknown')
      expect(result.message).toContain('just a string')
    })

    it('handles null', () => {
      expect(classifyScanError(null).code).toBe('unknown')
    })
  })

  it('always returns a non-empty message and remedy', () => {
    for (const input of [oauthError('invalid_client'), oauthError('invalid_grant', 400), new Error('x'), null]) {
      const r = classifyScanError(input)
      expect(r.message.length).toBeGreaterThan(0)
      expect(r.remedy.length).toBeGreaterThan(0)
    }
  })
})
