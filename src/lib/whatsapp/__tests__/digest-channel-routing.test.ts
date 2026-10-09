import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * TC-007, TC-008, TC-009 — AC-002, AC-003, AC-004.
 *
 * AC-004 is the whole reason this feature exists. Between 4 and 10 October 2026 the
 * scan ran perfectly every day and Meta rejected every digest with 131047, so nothing
 * arrived. A WhatsApp rejection is the CURRENT steady state, not an edge case — if it
 * can stop the email going out, the feature has failed at its one job.
 */

const h = vi.hoisted(() => ({
  channel: 'both' as string,
  sendTemplate: vi.fn(),
  sendDigest: vi.fn(),
  sendDigestEmail: vi.fn(),
  scanResults: [] as unknown[],
}))

vi.mock('@/lib/digest/channel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/digest/channel')>()),
  getDigestChannel: vi.fn(async () => h.channel),
}))
vi.mock('@/lib/whatsapp/client', () => ({ sendTemplate: h.sendTemplate }))
vi.mock('@/lib/whatsapp/digest-sender', () => ({ sendDigest: h.sendDigest }))
vi.mock('@/lib/email/send-digest-email', () => ({ sendDigestEmail: h.sendDigestEmail }))
vi.mock('@/lib/whatsapp/digest-items', () => ({
  loadDigestItems: vi.fn(async () => []),
  digestCutoff: vi.fn(() => new Date()),
  DIGEST_MAX_AGE_DAYS: 7,
}))
vi.mock('@/lib/app-settings', () => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => {}),
}))
vi.mock('@/lib/scan/run-scan', () => ({
  runScanForAccount: vi.fn(async () => ({
    windowFrom: new Date('2026-10-03'),
    windowTo: new Date('2026-10-10'),
    totalEmails: 10, newEmails: 2, alreadyScanned: 8,
  })),
}))
vi.mock('@/lib/whatsapp/ops-alert', () => ({ sendOpsAlert: vi.fn(async () => true) }))
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => Promise.resolve([{ id: 'a1', email: 'mboctor@gmail.com', accessToken: 't' }]) }) },
}))

import { runDailyDigest } from '@/lib/whatsapp/daily-digest'

beforeEach(() => {
  vi.clearAllMocks()
  h.channel = 'both'
  process.env.WHATSAPP_ALLOWED_NUMBERS = '+61412408587'
  delete process.env.WHATSAPP_TEMPLATE_DIGEST
  h.sendDigestEmail.mockResolvedValue({ sent: 1, failed: 0 })
  h.sendDigest.mockResolvedValue(undefined)
})

describe('digest channel routing', () => {
  it('TC-007 / AC-002 — email only: WhatsApp is never touched', async () => {
    h.channel = 'email'
    const res = await runDailyDigest()
    expect(h.sendDigest).not.toHaveBeenCalled()
    expect(h.sendTemplate).not.toHaveBeenCalled()
    expect(h.sendDigestEmail).toHaveBeenCalledTimes(1)
    expect(res.emailSent).toBe(1)
    expect(res.sent).toBe(0)
  })

  it('TC-008 / AC-003 — whatsapp only: no email is sent', async () => {
    h.channel = 'whatsapp'
    const res = await runDailyDigest()
    expect(h.sendDigestEmail).not.toHaveBeenCalled()
    expect(h.sendDigest).toHaveBeenCalledTimes(1)
    expect(res.sent).toBe(1)
    expect(res.emailSent ?? 0).toBe(0)
  })

  it('TC-009 / AC-004 — both, WhatsApp rejected: the email still goes', async () => {
    h.channel = 'both'
    // Exactly what production does today: Meta 131047.
    h.sendDigest.mockRejectedValue(Object.assign(new Error('Re-engagement message'), { code: 131047 }))

    const res = await runDailyDigest()

    expect(res.failed).toBe(1)        // WhatsApp failed, as it does every night
    expect(res.emailSent).toBe(1)     // and the digest still arrived
    expect(h.sendDigestEmail).toHaveBeenCalledTimes(1)
  })

  it('AC-004 — an email throw cannot erase a successful WhatsApp send', async () => {
    h.channel = 'both'
    h.sendDigestEmail.mockRejectedValue(new Error('gmail exploded'))

    const res = await runDailyDigest()

    expect(res.sent).toBe(1)
    expect(res.emailFailed).toBe(1)
  })

  it('reports which channel ran, so a wrong setting is visible in the result', async () => {
    h.channel = 'email'
    expect((await runDailyDigest()).channel).toBe('email')
  })
})
