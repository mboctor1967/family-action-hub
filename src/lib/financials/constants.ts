import { CATEGORIES } from '@/types/financials'

// Build category list string for the AI prompt
const categoryList = Object.entries(CATEGORIES)
  .map(([cat, subs]) => {
    if (subs.length === 0) return cat
    return `${cat}\n${subs.map((s) => `  - ${s}`).join('\n')}`
  })
  .join('\n')

export const STATEMENT_PARSE_SYSTEM_PROMPT = `You are a bank statement parser. Extract structured data from the following Australian bank statement text.
Respond ONLY with a valid JSON object — no markdown, no explanation, no backticks.

The JSON must have this exact structure:
{
  "bank_name": string,
  "account_name": string,
  "account_number_last4": string,
  "bsb": string | null,
  "account_type": "personal_cheque" | "personal_savings" | "business_cheque" | "credit_card",
  "statement_start": "YYYY-MM-DD",
  "statement_end": "YYYY-MM-DD",
  "opening_balance": number,
  "closing_balance": number,
  "transactions": [
    {
      "transaction_date": "YYYY-MM-DD",
      "description_raw": string,
      "amount": number,
      "is_debit": boolean,
      "running_balance": number | null,
      "merchant_name": string | null,
      "category": string,
      "subcategory": string | null,
      "is_subscription": boolean,
      "subscription_frequency": "monthly" | "annual" | "weekly" | null,
      "is_tax_deductible": boolean,
      "tax_category": "work_expense" | "investment" | "donation" | null
    }
  ]
}

Rules:
- For amounts: use negative numbers for debits/payments, positive for credits/deposits.
- For merchant_name: infer the merchant from the raw description (e.g. "WOOLWORTHS 1234 SYDNEY" → "Woolworths").
- For is_subscription: flag recurring charges like Netflix, Spotify, insurance premiums, etc.
- For is_tax_deductible: flag work-related expenses, donations, and investment-related costs.
- If you cannot confidently determine a field, use null.
- Return ALL transactions from the statement — do not skip any.

Category must be one of:
${categoryList}

Subcategory should be one of the listed subcategories for the chosen category, or null if uncertain.`

// Model IDs
export const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6-20250415',
} as const

// Cost estimates per statement (input ~2500 tokens + output ~3000 tokens)
export const COST_PER_STATEMENT = {
  haiku: 0.014,
  sonnet: 0.05,
} as const

export function getModelConfig() {
  const modelKey = (process.env.FINANCIAL_PARSE_MODEL || 'haiku') as keyof typeof MODELS
  return {
    modelId: MODELS[modelKey] || MODELS.haiku,
    modelKey,
    costPerStatement: COST_PER_STATEMENT[modelKey] || COST_PER_STATEMENT.haiku,
  }
}
