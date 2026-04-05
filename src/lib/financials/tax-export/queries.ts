/**
 * DB queries for the tax export bundler.
 * Separated from bundler.ts to keep the orchestration file focused.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { db } from '@/lib/db'
import {
  financialTransactions,
  financialAccounts,
  financialEntities,
  financialStatements,
  financialAssumptions,
} from '@/lib/db/schema'
import { eq, and, gte, lte, isNull, isNotNull, sql, inArray, or } from 'drizzle-orm'

export interface FyRange {
  label: string // 'FY2025-26'
  startDate: string // '2025-07-01'
  endDate: string // '2026-06-30'
}

/**
 * Compute FY label + ISO dates from a short FY code like 'FY2025-26'.
 * Australian FY: 1 July → 30 June.
 */
export function parseFy(fy: string): FyRange {
  const match = fy.match(/FY(\d{4})-(\d{2})/)
  if (!match) throw new Error(`Invalid FY format: ${fy}`)
  const startYear = parseInt(match[1], 10)
  const endYear = 2000 + parseInt(match[2], 10)
  if (endYear !== startYear + 1) throw new Error(`Invalid FY range: ${fy}`)
  return {
    label: fy,
    startDate: `${startYear}-07-01`,
    endDate: `${endYear}-06-30`,
  }
}

/**
 * Is this FY in the future or current (not yet ended)?
 */
export function isPartialFy(fy: FyRange, today: Date = new Date()): boolean {
  return new Date(fy.endDate) > today
}

export interface EntityRow {
  id: string
  name: string
  type: 'personal' | 'business' | 'trust'
  invoiceDriveFolder: string | null
}

export async function listAllEntities(): Promise<EntityRow[]> {
  const rows = await db
    .select({
      id: financialEntities.id,
      name: financialEntities.name,
      type: financialEntities.type,
      invoiceDriveFolder: financialEntities.invoiceDriveFolder,
    })
    .from(financialEntities)
    .orderBy(financialEntities.sortOrder)

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    type: (r.type ?? 'personal') as 'personal' | 'business' | 'trust',
    invoiceDriveFolder: r.invoiceDriveFolder,
  }))
}

export interface EntityTxn {
  id: string
  date: string
  merchantName: string | null
  descriptionRaw: string | null
  amount: number
  amountExGst: number | null
  gstAmount: number | null
  category: string | null
  subcategory: string | null
  isTaxDeductible: boolean
  atoCodePersonal: string | null
  atoCodeCompany: string | null
  aiSuggestedAtoCodePersonal: string | null
  aiSuggestedAtoCodeCompany: string | null
  accountName: string | null
  bankName: string | null
  transferPairId: string | null
}

/**
 * Fetch all transactions for an entity + FY, joining via the account → entity relationship.
 * Excludes transfer-detected txns from the tax-report view.
 */
export async function getEntityTransactions(
  entityId: string,
  fy: FyRange
): Promise<EntityTxn[]> {
  const rows = await db
    .select({
      id: financialTransactions.id,
      date: financialTransactions.transactionDate,
      merchantName: financialTransactions.merchantName,
      descriptionRaw: financialTransactions.descriptionRaw,
      amount: financialTransactions.amount,
      amountExGst: financialTransactions.amountExGst,
      gstAmount: financialTransactions.gstAmount,
      category: financialTransactions.category,
      subcategory: financialTransactions.subcategory,
      isTaxDeductible: financialTransactions.isTaxDeductible,
      atoCodePersonal: financialTransactions.atoCodePersonal,
      atoCodeCompany: financialTransactions.atoCodeCompany,
      aiSuggestedAtoCodePersonal: financialTransactions.aiSuggestedAtoCodePersonal,
      aiSuggestedAtoCodeCompany: financialTransactions.aiSuggestedAtoCodeCompany,
      accountName: financialAccounts.accountName,
      bankName: financialAccounts.bankName,
      transferPairId: financialTransactions.transferPairId,
    })
    .from(financialTransactions)
    .innerJoin(financialAccounts, eq(financialTransactions.accountId, financialAccounts.id))
    .where(
      and(
        eq(financialAccounts.entityId, entityId),
        gte(financialTransactions.transactionDate, fy.startDate),
        lte(financialTransactions.transactionDate, fy.endDate),
        isNull(financialTransactions.transferPairId)
      )
    )
    .orderBy(financialTransactions.transactionDate, financialTransactions.id)

  return rows.map(r => ({
    id: r.id,
    date: r.date,
    merchantName: r.merchantName,
    descriptionRaw: r.descriptionRaw,
    amount: Number(r.amount),
    amountExGst: r.amountExGst !== null ? Number(r.amountExGst) : null,
    gstAmount: r.gstAmount !== null ? Number(r.gstAmount) : null,
    category: r.category,
    subcategory: r.subcategory,
    isTaxDeductible: r.isTaxDeductible ?? false,
    atoCodePersonal: r.atoCodePersonal,
    atoCodeCompany: r.atoCodeCompany,
    aiSuggestedAtoCodePersonal: r.aiSuggestedAtoCodePersonal,
    aiSuggestedAtoCodeCompany: r.aiSuggestedAtoCodeCompany,
    accountName: r.accountName,
    bankName: r.bankName,
    transferPairId: r.transferPairId,
  }))
}

export interface EntityAssumption {
  type: string
  valueNumeric: number | null
  valueText: string | null
  rationale: string | null
}

export async function getEntityAssumptions(
  entityId: string,
  fy: FyRange
): Promise<EntityAssumption[]> {
  const rows = await db
    .select({
      type: financialAssumptions.assumptionType,
      valueNumeric: financialAssumptions.valueNumeric,
      valueText: financialAssumptions.valueText,
      rationale: financialAssumptions.rationale,
    })
    .from(financialAssumptions)
    .where(
      and(
        eq(financialAssumptions.entityId, entityId),
        eq(financialAssumptions.fy, fy.label)
      )
    )

  return rows.map(r => ({
    type: r.type,
    valueNumeric: r.valueNumeric !== null ? Number(r.valueNumeric) : null,
    valueText: r.valueText,
    rationale: r.rationale,
  }))
}

/**
 * Count statements imported per month for an entity, to detect coverage gaps.
 */
export async function getCoverageGaps(
  entityId: string,
  fy: FyRange
): Promise<string[]> {
  // Get all statements covering any period in this FY for accounts in this entity
  const stmts = await db
    .select({
      start: financialStatements.statementStart,
      end: financialStatements.statementEnd,
    })
    .from(financialStatements)
    .innerJoin(financialAccounts, eq(financialStatements.accountId, financialAccounts.id))
    .where(
      and(
        eq(financialAccounts.entityId, entityId),
        isNotNull(financialStatements.statementStart),
        lte(financialStatements.statementStart, fy.endDate),
        gte(financialStatements.statementEnd, fy.startDate)
      )
    )

  // Build a set of YYYY-MM months that are covered
  const coveredMonths = new Set<string>()
  for (const s of stmts) {
    if (!s.start || !s.end) continue
    let d = new Date(s.start)
    const end = new Date(s.end)
    while (d <= end) {
      coveredMonths.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      d.setMonth(d.getMonth() + 1)
    }
  }

  // Build expected months within the FY (bounded by "now" for partial years)
  const gaps: string[] = []
  const fyStart = new Date(fy.startDate)
  const fyEnd = new Date(fy.endDate)
  const today = new Date()
  const walkEnd = fyEnd < today ? fyEnd : today
  let d = new Date(fyStart.getFullYear(), fyStart.getMonth(), 1)
  while (d <= walkEnd) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!coveredMonths.has(key)) gaps.push(key)
    d.setMonth(d.getMonth() + 1)
  }
  return gaps
}
