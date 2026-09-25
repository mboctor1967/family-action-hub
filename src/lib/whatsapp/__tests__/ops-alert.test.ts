import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Covers AC-010 / AC-011 (TC-016 / TC-017).
 *
 * The alert exists because the scan failed silently 159 times. It goes to the
 * operator alone — the other allowlisted family members cannot act on an OAuth
 * error and should never see one.
 */

const h = vi.hoisted(() => ({ sendMessage: vi.fn(), sendTemplate: vi.fn() }))
vi.mock('@/lib/whatsapp/client', () => ({ sendMessage: h.sendMessage, sendTemplate: h.sendTemplate }))

import { resolveOpsRecipient, formatOpsAlert, sendOpsAlert } from '../ops-alert'

const failure = (over: Record<string, unknown> = {}) => ({
  email: 'mboctor@gmail.com',
  errorCode: 'invalid_client',
  errorMessage: 'Gmail authentication failed: the OAuth client secret is no longer valid.',
  lastSuccessfulScan: new Date('2026-05-02T03:01:10Z'),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  h.sendMessage.mockResolvedValue('wamid.1')
  h.sendTemplate.mockResolvedValue('wamid.2')
  delete process.env.WHATSAPP_TEMPLATE_OPS_ALERT
  delete process.env.WHATSAPP_OPS_NUMBER
  process.env.WHATSAPP_ALLOWED_NUMBERS = '+61412408587,+61402149544'
})

describe('resolveOpsRecipient (AC-010)', () => {
  it('prefers WHATSAPP_OPS_NUMBER when set', () => {
    process.env.WHATSAPP_OPS_NUMBER = '+61400000000'
    expect(resolveOpsRecipient()).toBe('+61400000000')
  })

  it('TC-017 — falls back to the first allowlist entry when unset', () => {
    expect(resolveOpsRecipient()).toBe('+61412408587')
  })

  it('trims whitespace in the allowlist', () => {
    process.env.WHATSAPP_ALLOWED_NUMBERS = '  +61412408587 , +61402149544 '
    expect(resolveOpsRecipient()).toBe('+61412408587')
  })

  it('returns null when there is no recipient at all', () => {
    process.env.WHATSAPP_ALLOWED_NUMBERS = ''
    expect(resolveOpsRecipient()).toBeNull()
  })
})

describe('formatOpsAlert (AC-010)', () => {
  it('TC-016 — names the error code, the account and the last successful scan', () => {
    const body = formatOpsAlert([failure()])

    expect(body).toContain('mboctor@gmail.com')
    expect(body).toContain('invalid_client')
    expect(body).toMatch(/2 May 2026|02 May 2026/)
  })

  it('carries the remedy so the fix does not require opening the app', () => {
    expect(formatOpsAlert([failure()])).toContain('OAuth client secret')
  })

  it('states plainly that the digest was suppressed', () => {
    expect(formatOpsAlert([failure()])).toMatch(/digest.*(not sent|suppressed)/i)
  })

  it('handles an account that has never scanned', () => {
    expect(formatOpsAlert([failure({ lastSuccessfulScan: null })])).toMatch(/never/i)
  })

  it('reports every failing account when there is more than one', () => {
    const body = formatOpsAlert([failure(), failure({ email: 'other@gmail.com', errorCode: 'invalid_grant' })])
    expect(body).toContain('mboctor@gmail.com')
    expect(body).toContain('other@gmail.com')
    expect(body).toContain('invalid_grant')
  })
})

describe('sendOpsAlert (AC-011)', () => {
  it('sends exactly one message, to the ops number only', async () => {
    process.env.WHATSAPP_OPS_NUMBER = '+61400000000'

    await sendOpsAlert([failure()])

    expect(h.sendMessage).toHaveBeenCalledTimes(1)
    expect(h.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+61400000000' }),
    )
  })

  it('never messages the other allowlisted numbers', async () => {
    await sendOpsAlert([failure()])

    const recipients = h.sendMessage.mock.calls.map((c) => c[0].to)
    expect(recipients).toEqual(['+61412408587'])
    expect(recipients).not.toContain('+61402149544')
  })

  it('does nothing when there are no failures', async () => {
    await sendOpsAlert([])
    expect(h.sendMessage).not.toHaveBeenCalled()
  })

  it('swallows a send failure rather than breaking the cron', async () => {
    h.sendMessage.mockRejectedValue(new Error('graph api down'))
    await expect(sendOpsAlert([failure()])).resolves.toBe(false)
  })

  it('reports success as true', async () => {
    await expect(sendOpsAlert([failure()])).resolves.toBe(true)
  })
})

describe('sendOpsAlert via template (AC-003)', () => {
  beforeEach(() => {
    process.env.WHATSAPP_TEMPLATE_OPS_ALERT = 'family_hub_scan_alert'
  })

  it('TC-003 — sends the template (deliverable outside the 24h window) to the ops number only', async () => {
    await expect(sendOpsAlert([failure()])).resolves.toBe(true)

    expect(h.sendMessage).not.toHaveBeenCalled()
    expect(h.sendTemplate).toHaveBeenCalledTimes(1)
    const args = h.sendTemplate.mock.calls[0][0]
    expect(args).toMatchObject({ to: '+61412408587', name: 'family_hub_scan_alert', kind: 'ops_alert' })
    const [code, lastScan, link] = args.bodyParams
    expect(code).toContain('invalid_client')
    expect(lastScan).toMatch(/2 May 2026|02 May 2026/)
    expect(link).toMatch(/^https:\/\/.+\/settings$/)
  })

  it('names every failing error code in one parameter', async () => {
    await sendOpsAlert([failure(), failure({ email: 'other@gmail.com', errorCode: 'invalid_grant' })])
    const [code] = h.sendTemplate.mock.calls[0][0].bodyParams
    expect(code).toContain('invalid_client')
    expect(code).toContain('invalid_grant')
  })

  it('reports a rejected template send as not delivered', async () => {
    h.sendTemplate.mockRejectedValue(new Error('132001 template does not exist'))
    await expect(sendOpsAlert([failure()])).resolves.toBe(false)
  })
})
