/**
 * ATO code reference data + subcategory mapping.
 * Source of truth for `docs/reference/phase-f-ato-codes.xlsx`.
 * Seeded into `ato_codes` table via `src/scripts/seed-ato-codes.ts` on first run.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

export type AtoScope = 'personal' | 'company'
export type AtoSection = 'income' | 'deduction' | 'expense' | 'other'

// -----------------------------------------------------------------------------
// ATO CODES — Individual Tax Return (Personal entities)
// -----------------------------------------------------------------------------

export interface AtoCodeDef {
  code: string
  scope: AtoScope
  section: AtoSection
  label: string
  description: string | null
  sortOrder: number
  isInternalSubcode?: boolean
  rollsUpTo?: string | null
}

export const ATO_CODES_PERSONAL: AtoCodeDef[] = [
  // Income items
  { code: 'I-1',  scope: 'personal', section: 'income', sortOrder: 10, label: 'Item 1 — Salary, wages, allowances', description: 'PAYG income' },
  { code: 'I-10', scope: 'personal', section: 'income', sortOrder: 20, label: 'Item 10 — Gross interest', description: 'Bank interest received' },
  { code: 'I-11', scope: 'personal', section: 'income', sortOrder: 30, label: 'Item 11 — Dividends', description: 'Franked / unfranked dividends' },
  { code: 'I-13', scope: 'personal', section: 'income', sortOrder: 40, label: 'Item 13 — Partnerships & trusts', description: 'Trust / partnership distributions' },
  { code: 'I-18', scope: 'personal', section: 'income', sortOrder: 50, label: 'Item 18 — Capital gains', description: 'Realised CGT events' },
  { code: 'I-24', scope: 'personal', section: 'income', sortOrder: 60, label: 'Item 24 — Other income', description: 'Freelance, gov benefits, misc' },
  // Deductions (D-codes)
  { code: 'D1',  scope: 'personal', section: 'deduction', sortOrder: 100, label: 'D1 — Work-related car expenses', description: 'Car for work (cents/km or logbook)' },
  { code: 'D2',  scope: 'personal', section: 'deduction', sortOrder: 110, label: 'D2 — Work-related travel expenses', description: 'Flights, hotels for work (non-car)' },
  { code: 'D3',  scope: 'personal', section: 'deduction', sortOrder: 120, label: 'D3 — Work-related clothing/laundry', description: 'Uniforms, protective, laundry' },
  { code: 'D4',  scope: 'personal', section: 'deduction', sortOrder: 130, label: 'D4 — Self-education expenses', description: 'Courses tied to current role' },
  { code: 'D5',  scope: 'personal', section: 'deduction', sortOrder: 140, label: 'D5 — Other work-related expenses', description: 'Phone %, WFH %, tools' },
  { code: 'D9',  scope: 'personal', section: 'deduction', sortOrder: 150, label: 'D9 — Gifts or donations', description: 'DGR-registered charities only' },
  { code: 'D10', scope: 'personal', section: 'deduction', sortOrder: 160, label: 'D10 — Cost of managing tax affairs', description: 'Accountant, tax software' },
  { code: 'D12', scope: 'personal', section: 'deduction', sortOrder: 170, label: 'D12 — Personal super contributions', description: 'Concessional voluntary contributions' },
  { code: 'D15', scope: 'personal', section: 'deduction', sortOrder: 180, label: 'D15 — Other deductions', description: 'Income protection premiums, etc.' },
]

// -----------------------------------------------------------------------------
// ATO CODES — Company Tax Return Item 6 (D3 Pty Ltd, Babyccino Pty Ltd)
// -----------------------------------------------------------------------------

export const ATO_CODES_COMPANY: AtoCodeDef[] = [
  // Income side
  { code: '6-INCOME',    scope: 'company', section: 'income', sortOrder: 10, label: 'Item 6 — Total income', description: 'Gross sales / services revenue' },
  { code: '6-INT-REC',   scope: 'company', section: 'income', sortOrder: 20, label: 'Item 6 — Gross interest (received)', description: 'Interest earned on business accounts' },
  { code: '6-DIV-REC',   scope: 'company', section: 'income', sortOrder: 30, label: 'Item 6 — Total dividends (received)', description: 'Dividend income' },
  { code: '6-OTHER-INC', scope: 'company', section: 'income', sortOrder: 40, label: 'Item 6 — Other gross income', description: 'Misc business income' },
  // Direct expense lines
  { code: '6-COGS',      scope: 'company', section: 'expense', sortOrder: 100, label: 'Item 6 — Cost of sales', description: 'Direct costs / purchases / stock movement' },
  { code: '6-CONTRACT',  scope: 'company', section: 'expense', sortOrder: 110, label: 'Item 6 — Contractor / sub-contractor / commission', description: 'ABN-holder payments' },
  { code: '6-WAGES',     scope: 'company', section: 'expense', sortOrder: 120, label: 'Item 6 — Total salary and wage expenses', description: 'Employee PAYG wages' },
  { code: '6-SUPER',     scope: 'company', section: 'expense', sortOrder: 130, label: 'Item 6 — Superannuation expenses', description: 'Employer SG contributions' },
  { code: '6-BAD-DEBT',  scope: 'company', section: 'expense', sortOrder: 140, label: 'Item 6 — Bad debts', description: 'Written-off receivables' },
  { code: '6-LEASE',     scope: 'company', section: 'expense', sortOrder: 150, label: 'Item 6 — Lease expenses (Australia)', description: 'Operating leases' },
  { code: '6-RENT',      scope: 'company', section: 'expense', sortOrder: 160, label: 'Item 6 — Rent expenses', description: 'Premises rent' },
  { code: '6-INT-PAID',  scope: 'company', section: 'expense', sortOrder: 170, label: 'Item 6 — Interest expenses (Australia)', description: 'Business loan interest' },
  { code: '6-DEPN',      scope: 'company', section: 'expense', sortOrder: 180, label: 'Item 6 — Depreciation expenses', description: 'Capital asset writedown' },
  { code: '6-MV',        scope: 'company', section: 'expense', sortOrder: 190, label: 'Item 6 — Motor vehicle expenses', description: 'Business vehicle running costs' },
  { code: '6-REPAIRS',   scope: 'company', section: 'expense', sortOrder: 200, label: 'Item 6 — Repairs and maintenance', description: 'Non-capital fixes' },
  { code: '6-FBT',       scope: 'company', section: 'expense', sortOrder: 210, label: 'Item 6 — Fringe benefits tax', description: 'FBT paid' },
  { code: '6-AUDIT',     scope: 'company', section: 'expense', sortOrder: 220, label: 'Item 6 — External audit fees', description: 'If audited' },
  // Catchall rollup
  { code: '6-OTHER-EXP', scope: 'company', section: 'expense', sortOrder: 300, label: 'Item 6 — All other expenses', description: 'Form rollup line for everything below' },
  // Internal sub-codes (roll up to 6-OTHER-EXP on the form)
  { code: '6-OTHER-INSURANCE', scope: 'company', section: 'expense', sortOrder: 310, isInternalSubcode: true, rollsUpTo: '6-OTHER-EXP', label: '(internal) Business insurance', description: 'PI, public liability, contents' },
  { code: '6-OTHER-MARKETING', scope: 'company', section: 'expense', sortOrder: 320, isInternalSubcode: true, rollsUpTo: '6-OTHER-EXP', label: '(internal) Marketing & advertising', description: 'Ads, promo, content' },
  { code: '6-OTHER-SUBS',      scope: 'company', section: 'expense', sortOrder: 330, isInternalSubcode: true, rollsUpTo: '6-OTHER-EXP', label: '(internal) Subscriptions & SaaS', description: 'Software tools' },
  { code: '6-OTHER-TELCO',     scope: 'company', section: 'expense', sortOrder: 340, isInternalSubcode: true, rollsUpTo: '6-OTHER-EXP', label: '(internal) Telco & internet', description: 'Business phone, data' },
  { code: '6-OTHER-PROFEES',   scope: 'company', section: 'expense', sortOrder: 350, isInternalSubcode: true, rollsUpTo: '6-OTHER-EXP', label: '(internal) Professional fees', description: 'Legal, accounting, consulting' },
  { code: '6-OTHER-BANKFEES',  scope: 'company', section: 'expense', sortOrder: 360, isInternalSubcode: true, rollsUpTo: '6-OTHER-EXP', label: '(internal) Bank & merchant fees', description: 'Incl. Stripe/Square fees' },
  { code: '6-OTHER-OFFICE',    scope: 'company', section: 'expense', sortOrder: 370, isInternalSubcode: true, rollsUpTo: '6-OTHER-EXP', label: '(internal) Office supplies', description: 'Consumables, stationery' },
  { code: '6-OTHER-TRAVEL',    scope: 'company', section: 'expense', sortOrder: 380, isInternalSubcode: true, rollsUpTo: '6-OTHER-EXP', label: '(internal) Business travel (non-MV)', description: 'Flights, accommodation' },
  { code: '6-OTHER-MISC',      scope: 'company', section: 'expense', sortOrder: 390, isInternalSubcode: true, rollsUpTo: '6-OTHER-EXP', label: '(internal) Other / misc', description: 'Catchall' },
]

export const ALL_ATO_CODES: AtoCodeDef[] = [...ATO_CODES_PERSONAL, ...ATO_CODES_COMPANY]

// Quick lookups
export const ATO_CODE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_ATO_CODES.map(c => [c.code, c.label])
)

// -----------------------------------------------------------------------------
// Subcategory → ATO code default mapping
// Keyed by subcategory name (not ID) for readability. Seeded into
// financial_subcategories.ato_code_personal / ato_code_company via the seed script.
// -----------------------------------------------------------------------------

interface SubcategoryMapping {
  personal?: string | null
  company?: string | null
}

export const SUBCATEGORY_ATO_MAP: Record<string, SubcategoryMapping> = {
  // INCOME
  'Salary / Payroll':         { personal: 'I-1' },
  'Freelance / Consulting':   { personal: 'I-24', company: '6-INCOME' },
  'Investment Returns':       { personal: 'I-10', company: '6-INT-REC' }, // split at runtime by source
  'Government Benefits':      { personal: 'I-24' },
  'Other Income':             { personal: 'I-24', company: '6-OTHER-INC' },
  // BUSINESS EXPENSES
  'Contractors & Services':   { company: '6-CONTRACT' },
  'Equipment & Technology':   { company: '6-OTHER-OFFICE' }, // refined to 6-DEPN if > $300
  'Professional Services':    { personal: 'D10', company: '6-OTHER-PROFEES' },
  'Marketing & Advertising':  { company: '6-OTHER-MARKETING' },
  // DONATIONS & GIVING
  'Charity':                  { personal: 'D9' }, // refined: only if DGR
  'Church / Religious':       { personal: 'D9' }, // refined: only if DGR
  'Community / School':       { personal: 'D9' },
  'Sponsorship':              { personal: 'D9' },
  // EDUCATION & CHILDCARE
  'Courses & Books':          { personal: 'D4', company: '6-OTHER-EXP' }, // refined: not < $50 personal
  // FINANCIAL
  'Bank Fees':                { company: '6-OTHER-BANKFEES' },
  'Loan Repayments':          { personal: 'D5', company: '6-INT-PAID' }, // interest portion only
  // HOUSING
  'Mortgage / Rent':          { company: '6-RENT' }, // only if business premises
  'Strata / Body Corporate':  { company: '6-RENT' },
  'Maintenance & Repairs':    { company: '6-REPAIRS' },
  // HOUSEHOLD BILLS
  'Electricity':              { personal: 'D5', company: '6-OTHER-OFFICE' },
  'Gas':                      { personal: 'D5', company: '6-OTHER-OFFICE' },
  'Internet':                 { personal: 'D5', company: '6-OTHER-TELCO' },
  'Phone / Mobile':           { personal: 'D5', company: '6-OTHER-TELCO' },
  // INSURANCE
  'Life & Income Protection': { personal: 'D15' }, // income protection portion only
  'Business Insurance':       { company: '6-OTHER-INSURANCE' },
  // INVESTMENTS
  'Super Contributions':      { personal: 'D12', company: '6-SUPER' },
  'Dividends & Distributions':{ personal: 'I-11', company: '6-DIV-REC' },
  // SHOPPING & LIFESTYLE
  'Clothing & Apparel':       { personal: 'D3', company: '6-OTHER-EXP' }, // refined: only with uniform keyword
  'Electronics & Tech':       { personal: 'D5', company: '6-DEPN' }, // refined: > $300 = depreciation
  // SUBSCRIPTIONS & DIGITAL
  'Software & SaaS':          { personal: 'D5', company: '6-OTHER-SUBS' }, // refined: null if entertainment merchant
  'Cloud Services':           { personal: 'D5', company: '6-OTHER-SUBS' },
  'Telco':                    { personal: 'D5', company: '6-OTHER-TELCO' },
  'Streaming':                { personal: null, company: null }, // always non-deductible
  // TRANSPORT
  'Tesla / EV Charging':      { personal: 'D1', company: '6-MV' },
  'Fuel':                     { personal: 'D1', company: '6-MV' },
  'Rego & CTP':               { personal: 'D1', company: '6-MV' },
  'Tolls & Parking':          { personal: 'D1', company: '6-MV' },
  'Public Transport':         { personal: 'D2', company: '6-OTHER-TRAVEL' },
  'Uber / Rideshare':         { personal: 'D2', company: '6-OTHER-TRAVEL' },
  // TRAVEL
  'Flights':                  { personal: 'D2', company: '6-OTHER-TRAVEL' },
  'Hotels & Accommodation':   { personal: 'D2', company: '6-OTHER-TRAVEL' },
  'Car Rental':               { personal: 'D2', company: '6-OTHER-TRAVEL' },
  'Travel Insurance':         { company: '6-OTHER-TRAVEL' },
  // Everything else: no mapping → null (private / non-deductible)
}

/**
 * Category-level fallback mapping — used when a transaction has no subcategory set.
 * Broader / less precise than the subcategory mapping; refined rules still apply.
 */
export const CATEGORY_ATO_MAP: Record<string, SubcategoryMapping> = {
  'INCOME':                   { personal: 'I-24', company: '6-OTHER-INC' },
  'BUSINESS EXPENSES':        { personal: null, company: '6-OTHER-EXP' },
  'DONATIONS & GIVING':       { personal: 'D9', company: null },
  'EDUCATION & CHILDCARE':    { personal: 'D4', company: '6-OTHER-EXP' },
  'FINANCIAL':                { personal: null, company: '6-OTHER-BANKFEES' },
  'HOUSEHOLD BILLS':          { personal: 'D5', company: '6-OTHER-OFFICE' },
  'HOUSING':                  { personal: null, company: '6-RENT' },
  'INSURANCE':                { personal: null, company: '6-OTHER-INSURANCE' },
  'INVESTMENTS':              { personal: 'I-11', company: '6-DIV-REC' },
  'SHOPPING & LIFESTYLE':     { personal: null, company: '6-OTHER-OFFICE' },
  'SUBSCRIPTIONS & DIGITAL':  { personal: 'D5', company: '6-OTHER-SUBS' },
  'TRANSPORT':                { personal: 'D1', company: '6-MV' },
  'TRAVEL':                   { personal: 'D2', company: '6-OTHER-TRAVEL' },
  // Non-deductible / personal-only categories have no mapping:
  //   DINING & COFFEE, GROCERIES, HEALTH, KIDS & PETS, SPORTS & FITNESS, TRANSFERS, OTHER
}

// -----------------------------------------------------------------------------
// Refinement rules — data-driven table for rule-based ATO proposer
// Applied AFTER the subcategory default lookup. Each rule can override the code
// (set to a new value or null). Evaluated in order; first match wins per rule id.
// -----------------------------------------------------------------------------

export interface RefinementContext {
  txn: { merchantName: string | null; descriptionRaw: string | null; amount: string | number }
  subcatName: string | null
}

export interface RefinementRule {
  id: string
  scope: AtoScope
  when: (ctx: RefinementContext) => boolean
  set: string | null // value to set the code to (or null to clear)
}

const absAmount = (a: string | number) => Math.abs(Number(a))

export const REFINEMENT_RULES: RefinementRule[] = [
  // Personal — Software & SaaS charged from entertainment merchants is private, not deductible
  {
    id: 'saas-entertainment-regex',
    scope: 'personal',
    when: ({ txn, subcatName }) =>
      subcatName === 'Software & SaaS' &&
      /netflix|spotify|disney|stan|kayo|prime|apple tv|hulu|youtube premium/i.test(txn.merchantName ?? ''),
    set: null,
  },
  // Personal — Clothing requires uniform/PPE keyword
  {
    id: 'clothing-requires-uniform-keyword',
    scope: 'personal',
    when: ({ txn, subcatName }) =>
      subcatName === 'Clothing & Apparel' &&
      !/uniform|ppe|safety|work wear|hi ?vis|steel cap/i.test(txn.descriptionRaw ?? ''),
    set: null,
  },
  // Personal — Courses under $50 are likely casual reading, not D4
  {
    id: 'courses-under-50-non-deductible',
    scope: 'personal',
    when: ({ txn, subcatName }) => subcatName === 'Courses & Books' && absAmount(txn.amount) < 50,
    set: null,
  },
  // Company — Equipment > $300 depreciates instead of straight expense
  {
    id: 'equipment-over-300-depreciation',
    scope: 'company',
    when: ({ txn, subcatName }) =>
      subcatName === 'Equipment & Technology' && absAmount(txn.amount) > 300,
    set: '6-DEPN',
  },
  // Company — Electronics & Tech > $300 also depreciates
  {
    id: 'electronics-over-300-depreciation',
    scope: 'company',
    when: ({ txn, subcatName }) =>
      subcatName === 'Electronics & Tech' && absAmount(txn.amount) > 300,
    set: '6-DEPN',
  },
]

// -----------------------------------------------------------------------------
// Export helpers for the seed script
// -----------------------------------------------------------------------------

export function getPersonalCodesByCode(): Record<string, AtoCodeDef> {
  return Object.fromEntries(ATO_CODES_PERSONAL.map(c => [c.code, c]))
}

export function getCompanyCodesByCode(): Record<string, AtoCodeDef> {
  return Object.fromEntries(ATO_CODES_COMPANY.map(c => [c.code, c]))
}
