/**
 * AI cost estimation for Claude-enhanced ATO code proposals.
 *
 * Model: claude-haiku-4-5-20251001
 * Phase F1 — Tax Prep / Accountant Pack
 */

export const CLAUDE_PRICING = {
  model: 'claude-haiku-4-5',
  inputPer1M: 1.0, // USD per 1M input tokens
  outputPer1M: 5.0, // USD per 1M output tokens
  currency: 'USD',
  asOf: '2026-04',
}

const INPUT_TOKENS_PER_TXN = 400
const OUTPUT_TOKENS_PER_TXN = 50

export const COST_PER_TXN_USD =
  (INPUT_TOKENS_PER_TXN / 1_000_000) * CLAUDE_PRICING.inputPer1M +
  (OUTPUT_TOKENS_PER_TXN / 1_000_000) * CLAUDE_PRICING.outputPer1M
// = $0.00065 per txn

const PER_IMPORT_SAMPLE_TXNS = 100

export interface CostEstimate {
  perImport: { txnCount: number; cost: number }
  monthly: { txnCount: number; cost: number }
  backfill?: { txnCount: number; cost: number }
}

export function estimateCosts(
  monthlyAvgTxnCount: number,
  backfillTxnCount: number | null
): CostEstimate {
  const round = (n: number) => Math.round(n * 100) / 100

  const result: CostEstimate = {
    perImport: {
      txnCount: PER_IMPORT_SAMPLE_TXNS,
      cost: round(PER_IMPORT_SAMPLE_TXNS * COST_PER_TXN_USD),
    },
    monthly: {
      txnCount: monthlyAvgTxnCount,
      cost: round(monthlyAvgTxnCount * COST_PER_TXN_USD),
    },
  }

  if (backfillTxnCount !== null) {
    result.backfill = {
      txnCount: backfillTxnCount,
      cost: round(backfillTxnCount * COST_PER_TXN_USD),
    }
  }

  return result
}
