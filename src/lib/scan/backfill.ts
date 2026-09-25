import { countUnscanned, runScanForAccount } from '@/lib/scan/run-scan'
import { LIST_CAP } from '@/lib/gmail/client'

/**
 * Backfill of emails missed during an outage (AC-010).
 *
 * The estimate is computed from Gmail ids alone — no email is classified, so no
 * paid AI call happens until the operator has seen the cost and pressed Run.
 * Runs are chunked so each request fits inside the function time limit; because
 * the scan is unscanned-first and dedupes on message id, a chunk interrupted
 * half-way is simply picked up again by the next one.
 */

/** Same pricing the hub already uses for Haiku 4.5 (see config of record, 2026-04). */
export const SCAN_AI_PRICING = { model: 'claude-haiku-4-5', inputPer1M: 1.0, outputPer1M: 5.0, currency: 'USD', asOf: '2026-04' } as const

// Measured 2026-09-25: the ~6.3k-char system prompt (~1.9k tokens) is shared by a
// batch of 5, plus ~250 tokens of headers and 500-char body per email; the JSON
// verdict is ~100 tokens. Rounded up so the estimate errs high.
const INPUT_TOKENS_PER_EMAIL = 650
const OUTPUT_TOKENS_PER_EMAIL = 120

export const COST_PER_EMAIL_USD =
  (INPUT_TOKENS_PER_EMAIL / 1_000_000) * SCAN_AI_PRICING.inputPer1M +
  (OUTPUT_TOKENS_PER_EMAIL / 1_000_000) * SCAN_AI_PRICING.outputPer1M

/** Emails classified per request — the same cap as a normal scan, so it fits in maxDuration. */
export const BACKFILL_CHUNK = 100

// ~60 emails/day here, so 30 days stays well inside LIST_CAP. Longer ranges would
// silently lose their oldest ids at the cap (Gmail lists newest first).
const MAX_RANGE_DAYS = 30

/** Dates are instants: callers send ISO strings with an offset (the UI sends Sydney midnight). */
export function validateRange(from: Date, to: Date): string | null {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 'from and to must be valid dates'
  if (from >= to) return 'from must be before to'
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) return `range must be ${MAX_RANGE_DAYS} days or less`
  return null
}

/** A `to` in the future is meaningless for a backfill; clamp it to now. */
export function clampToNow(to: Date, now: Date = new Date()): Date {
  return to > now ? now : to
}

export async function estimateBackfill(accountId: string, from: Date, to: Date) {
  const { totalInWindow, unscanned } = await countUnscanned(accountId, { from, to })
  return {
    totalInWindow,
    unscanned,
    estCostUsd: unscanned * COST_PER_EMAIL_USD,
    perEmailUsd: COST_PER_EMAIL_USD,
    chunks: Math.ceil(unscanned / BACKFILL_CHUNK),
    pricing: SCAN_AI_PRICING,
    // The listing hit its ceiling, so the oldest emails in the range were not
    // counted. The UI must refuse to run and ask for a shorter range.
    truncated: totalInWindow >= LIST_CAP,
  }
}

export async function runBackfillChunk(accountId: string, from: Date, to: Date) {
  const r = await runScanForAccount(accountId, { range: { from, to }, maxEmails: BACKFILL_CHUNK })
  const saved = r.actionable + r.informational + r.noise
  return {
    processed: r.newEmails,
    saved,
    actionable: r.actionable,
    remaining: r.remaining ?? 0,
    // Emails were fetched but none were stored: another chunk would pay for the
    // same emails again. The caller must stop looping.
    stalled: r.newEmails > 0 && saved === 0,
  }
}
