import { describe, it, expect, vi, beforeEach } from 'vitest'

/** TC-010 (AC-010) — cost shown before any paid AI call, then chunked, resumable runs. */

const h = vi.hoisted(() => ({ countUnscanned: vi.fn(), runScanForAccount: vi.fn() }))
vi.mock('@/lib/scan/run-scan', () => ({ countUnscanned: h.countUnscanned, runScanForAccount: h.runScanForAccount }))

import { estimateBackfill, runBackfillChunk, COST_PER_EMAIL_USD, validateRange, clampToNow, BACKFILL_CHUNK } from '../backfill'
import { LIST_CAP } from '@/lib/gmail/client'

const from = new Date('2026-09-05T00:00:00+10:00')
const to = new Date('2026-09-25T00:00:00+10:00')

beforeEach(() => vi.clearAllMocks())

describe('estimateBackfill', () => {
  it('TC-010 — counts unscanned emails and prices them before anything is classified', async () => {
    h.countUnscanned.mockResolvedValue({ totalInWindow: 1400, unscanned: 1000 })
    const e = await estimateBackfill('acc-1', from, to)
    expect(e.unscanned).toBe(1000)
    expect(e.estCostUsd).toBeCloseTo(1000 * COST_PER_EMAIL_USD, 6)
    expect(e.chunks).toBe(Math.ceil(1000 / BACKFILL_CHUNK))
    expect(e.truncated).toBe(false)
    expect(h.runScanForAccount).not.toHaveBeenCalled()
  })

  it('marks the estimate truncated when the listing hit its cap', async () => {
    h.countUnscanned.mockResolvedValue({ totalInWindow: LIST_CAP, unscanned: 1500 })
    expect((await estimateBackfill('acc-1', from, to)).truncated).toBe(true)
  })

  it('per-email cost stays in the expected band for Haiku 4.5', () => {
    expect(COST_PER_EMAIL_USD).toBeGreaterThan(0.0005)
    expect(COST_PER_EMAIL_USD).toBeLessThan(0.003)
  })
})

describe('runBackfillChunk', () => {
  it('scans one chunk of the range and reports what is left', async () => {
    h.runScanForAccount.mockResolvedValue({ newEmails: 100, actionable: 6, informational: 30, noise: 64, remaining: 900 })
    const r = await runBackfillChunk('acc-1', from, to)
    expect(h.runScanForAccount).toHaveBeenCalledWith('acc-1', { range: { from, to }, maxEmails: BACKFILL_CHUNK })
    expect(r).toEqual({ processed: 100, saved: 100, actionable: 6, remaining: 900, stalled: false })
  })

  it('flags a stalled chunk (fetched but stored nothing) so the loop stops paying', async () => {
    h.runScanForAccount.mockResolvedValue({ newEmails: 100, actionable: 0, informational: 0, noise: 0, remaining: 900 })
    expect((await runBackfillChunk('acc-1', from, to)).stalled).toBe(true)
  })
})

describe('validateRange', () => {
  it('rejects reversed, future-less-than-past, or over-long ranges', () => {
    expect(validateRange(from, to)).toBeNull()
    expect(validateRange(to, from)).toMatch(/before/)
    expect(validateRange(new Date('2026-08-01'), to)).toMatch(/30 days/)
    expect(validateRange(new Date('bad'), to)).toMatch(/valid/)
  })
})

describe('clampToNow', () => {
  it('clamps a future end date to now', () => {
    const now = new Date('2026-09-25T02:00:00Z')
    expect(clampToNow(new Date('2026-10-01'), now)).toEqual(now)
    expect(clampToNow(new Date('2026-09-20'), now)).toEqual(new Date('2026-09-20'))
  })
})
