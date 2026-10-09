import { describe, it, expect } from 'vitest'
import { parseChannel, wantsEmail, wantsWhatsApp, DIGEST_CHANNELS } from '@/lib/digest/channel'

/**
 * TC-001 / AC-001 / AC-009.
 *
 * The channel decides whether a digest is delivered at all, so an unreadable stored
 * value must never mean "send nothing". Everything unrecognised falls back to `both`.
 */
describe('parseChannel', () => {
  it('accepts the three valid channels', () => {
    for (const c of DIGEST_CHANNELS) expect(parseChannel(c)).toBe(c)
  })

  it('falls back to both for anything unrecognised', () => {
    for (const bad of [undefined, null, '', '  ', 'sms', 'WHATSAPP ', 42, {}, []]) {
      expect(parseChannel(bad)).toBe('both')
    }
  })

  it('does not silently accept a near-miss', () => {
    // 'whatsap' is a typo, not a channel. Falling back to both is safe; guessing is not.
    expect(parseChannel('whatsap')).toBe('both')
    expect(parseChannel('emails')).toBe('both')
  })
})

/**
 * TC-007 / TC-008 — the predicates the pipeline branches on. Kept as named functions
 * rather than inline string comparisons so a new channel cannot be added without
 * deciding what each predicate means for it.
 */
describe('channel predicates', () => {
  it('whatsapp sends only WhatsApp', () => {
    expect(wantsWhatsApp('whatsapp')).toBe(true)
    expect(wantsEmail('whatsapp')).toBe(false)
  })

  it('email sends only email', () => {
    expect(wantsWhatsApp('email')).toBe(false)
    expect(wantsEmail('email')).toBe(true)
  })

  it('both sends both', () => {
    expect(wantsWhatsApp('both')).toBe(true)
    expect(wantsEmail('both')).toBe(true)
  })
})
