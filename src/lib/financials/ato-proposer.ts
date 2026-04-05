/**
 * Rule-based ATO code proposer.
 *
 * Given a transaction + its subcategory + the entity type, returns the
 * AI-suggested personal and company ATO codes. Used during ingest and
 * backfill. Pure function — no DB/API calls.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { REFINEMENT_RULES, CATEGORY_ATO_MAP, type RefinementContext, type AtoScope } from './ato-codes'

export interface ProposerTxn {
  merchantName: string | null
  descriptionRaw: string | null
  amount: string | number
  category: string | null // top-level category used as fallback when subcat is null
}

export interface ProposerSubcat {
  name: string
  atoCodePersonal: string | null
  atoCodeCompany: string | null
}

export type EntityType = 'personal' | 'business' | 'trust' | null

export interface AtoProposal {
  aiPersonal: string | null
  aiCompany: string | null
}

/**
 * Core proposer function.
 *
 * Steps:
 *   1. Start with subcategory defaults (both columns)
 *   2. Scope by entity type: personal entities get only aiPersonal, business/trust only aiCompany.
 *      Null entity type (unknown) returns both as a fallback.
 *   3. Apply refinement rules in order (first match wins per rule id).
 */
export function proposeAtoCodes(
  txn: ProposerTxn,
  subcat: ProposerSubcat | null,
  entityType: EntityType
): AtoProposal {
  // Primary: subcategory default
  let aiPersonal = subcat?.atoCodePersonal ?? null
  let aiCompany = subcat?.atoCodeCompany ?? null

  // Fallback: category-level mapping if both are null and a category is set
  if (aiPersonal === null && aiCompany === null && txn.category) {
    const catMap = CATEGORY_ATO_MAP[txn.category]
    if (catMap) {
      aiPersonal = catMap.personal ?? null
      aiCompany = catMap.company ?? null
    }
  }

  if (entityType === 'personal') {
    aiCompany = null
  } else if (entityType === 'business' || entityType === 'trust') {
    aiPersonal = null
  }
  // else: unknown entity — keep both as fallback

  const ctx: RefinementContext = {
    txn: {
      merchantName: txn.merchantName,
      descriptionRaw: txn.descriptionRaw,
      amount: txn.amount,
    },
    subcatName: subcat?.name ?? null,
  }

  aiPersonal = applyRefinements(aiPersonal, 'personal', ctx)
  aiCompany = applyRefinements(aiCompany, 'company', ctx)

  return { aiPersonal, aiCompany }
}

function applyRefinements(
  current: string | null,
  scope: AtoScope,
  ctx: RefinementContext
): string | null {
  let value = current
  for (const rule of REFINEMENT_RULES) {
    if (rule.scope !== scope) continue
    if (rule.when(ctx)) {
      value = rule.set
    }
  }
  return value
}
