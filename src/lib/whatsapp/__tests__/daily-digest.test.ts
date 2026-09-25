import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * TC-001 (AC-001) and the button half of TC-002 (AC-002).
 *
 * The digest used to go out as free-form text, which Meta silently drops once the
 * recipient has not messaged the bot for 24h. The daily send must be a template;
 * the full digest follows only when the recipient taps "Show digest".
 */

const h = vi.hoisted(() => ({
  gmailAccounts: [] as Array<Record<string, unknown>>,
  runScanForAccount: vi.fn(),
  sendOpsAlert: vi.fn(),
  sendDigest: vi.fn(),
  sendTemplate: vi.fn(),
  loadDigestItems: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: async () => h.gmailAccounts }) },
}))
vi.mock('@/lib/scan/run-scan', () => ({ runScanForAccount: h.runScanForAccount }))
vi.mock('@/lib/whatsapp/ops-alert', () => ({ sendOpsAlert: h.sendOpsAlert }))
vi.mock('@/lib/whatsapp/digest-sender', () => ({ sendDigest: h.sendDigest }))
vi.mock('@/lib/whatsapp/client', () => ({ sendTemplate: h.sendTemplate }))
vi.mock('@/lib/whatsapp/digest-items', () => ({
  loadDigestItems: h.loadDigestItems,
  digestCutoff: () => new Date('2026-09-18T00:00:00Z'),
}))
vi.mock('@/lib/app-settings', () => ({ getSetting: h.getSetting, setSetting: h.setSetting }))

import { runDailyDigest, sendFullDigest, DIGEST_BUTTON_PAYLOAD, LAST_DIGEST_STATS_KEY } from '../daily-digest'

const scanOk = {
  scanRunId: 'run-1', actionable: 2, informational: 0, noise: 0, skipped: 0,
  totalEmails: 10, newEmails: 4, alreadyScanned: 6,
  windowFrom: new Date('2026-09-18T00:00:00Z'), windowTo: new Date('2026-09-25T00:00:00Z'),
}
const item = (id: string) => ({ id, subject: 's', fromName: 'f', fromAddress: 'a@b', gmailMessageId: `m-${id}`, date: new Date() })

beforeEach(() => {
  vi.clearAllMocks()
  h.gmailAccounts = [{ id: 'acc-1', email: 'mboctor@gmail.com', lastScanAt: null }]
  h.runScanForAccount.mockResolvedValue(scanOk)
  h.sendTemplate.mockResolvedValue('wamid.1')
  h.sendDigest.mockResolvedValue(undefined)
  h.sendOpsAlert.mockResolvedValue(true)
  h.loadDigestItems.mockResolvedValue([item('e1'), item('e2'), item('e3'), item('e4')])
  h.getSetting.mockResolvedValue(null)
  h.setSetting.mockResolvedValue(undefined)
  process.env.WHATSAPP_ALLOWED_NUMBERS = '+61412408587,+61402149544'
  process.env.WHATSAPP_TEMPLATE_DIGEST = 'family_hub_digest'
})

describe('runDailyDigest (AC-001)', () => {
  it('TC-001 — sends the digest template with date, count and Show-digest payload to every recipient', async () => {
    const res = await runDailyDigest()

    expect(res).toMatchObject({ sent: 2, failed: 0, suppressed: false, scanErrors: 0 })
    expect(h.sendTemplate).toHaveBeenCalledTimes(2)
    const args = h.sendTemplate.mock.calls[0][0]
    expect(args).toMatchObject({
      to: '+61412408587',
      name: 'family_hub_digest',
      quickReplyPayload: DIGEST_BUTTON_PAYLOAD,
      kind: 'digest_notice',
    })
    expect(args.bodyParams).toHaveLength(2)
    expect(args.bodyParams[1]).toBe('4')
    // The full digest is not pushed unprompted — it would be dropped outside the 24h window.
    expect(h.sendDigest).not.toHaveBeenCalled()
  })

  it('stores the run stats so the tapped full digest shows the same numbers', async () => {
    await runDailyDigest()
    expect(h.setSetting).toHaveBeenCalledWith(LAST_DIGEST_STATS_KEY, expect.objectContaining({
      totalEmails: 10, newEmails: 4, alreadyScanned: 6, actionableCount: 4,
    }))
  })

  it('counts a rejected template send as failed, not sent (AC-004)', async () => {
    h.sendTemplate.mockResolvedValueOnce('wamid.1').mockRejectedValueOnce(new Error('131026'))
    const res = await runDailyDigest()
    expect(res).toMatchObject({ sent: 1, failed: 1 })
  })

  it('falls back to the free-form digest when no template is configured', async () => {
    delete process.env.WHATSAPP_TEMPLATE_DIGEST
    const res = await runDailyDigest()
    expect(h.sendTemplate).not.toHaveBeenCalled()
    expect(h.sendDigest).toHaveBeenCalledTimes(2)
    expect(res.sent).toBe(2)
  })

  it('suppresses the digest and alerts the operator when every scan fails', async () => {
    h.runScanForAccount.mockRejectedValue(Object.assign(new Error('invalid_grant'), { response: { data: { error: 'invalid_grant' } } }))
    const res = await runDailyDigest()
    expect(res).toMatchObject({ sent: 0, suppressed: true, scanErrors: 1 })
    expect(h.sendOpsAlert).toHaveBeenCalledTimes(1)
    expect(h.sendTemplate).not.toHaveBeenCalled()
  })

  it('returns skipped when there are no recipients', async () => {
    process.env.WHATSAPP_ALLOWED_NUMBERS = ''
    const res = await runDailyDigest()
    expect(res).toMatchObject({ sent: 0, skipped: 1 })
  })
})

describe('sendFullDigest (AC-002)', () => {
  it('TC-002 — sends the current items with the stored stats', async () => {
    h.getSetting.mockResolvedValue({
      windowFromLabel: '18 Sep', windowToLabel: '25 Sep', totalEmails: 10, newEmails: 4, alreadyScanned: 6, actionableCount: 4,
    })
    await sendFullDigest('+61412408587')
    expect(h.sendDigest).toHaveBeenCalledTimes(1)
    const args = h.sendDigest.mock.calls[0][0]
    expect(args.recipient).toBe('+61412408587')
    expect(args.items).toHaveLength(4)
    expect(args.stats).toMatchObject({ totalEmails: 10, actionableCount: 4 })
  })

  it('still works with no stored stats (first tap after deploy)', async () => {
    await sendFullDigest('+61412408587')
    const args = h.sendDigest.mock.calls[0][0]
    expect(args.stats.actionableCount).toBe(4)
  })
})
