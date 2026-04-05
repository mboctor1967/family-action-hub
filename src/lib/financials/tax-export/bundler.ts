/**
 * Tax export bundler — orchestrates the ZIP assembly.
 *
 * Takes an FY + optional entity filter, produces a ZIP containing:
 *   00-Cover-Sheet.pdf
 *   README.txt
 *   01-{Entity1}/{Entity1}-Report.pdf + CSVs + invoices/
 *   02-{Entity2}/...
 *   ...
 *
 * Uploads the resulting ZIP to Vercel Blob and returns the signed URL.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import JSZip from 'jszip'
import Papa from 'papaparse'
import { renderToBuffer } from '@react-pdf/renderer'
import { put } from '@vercel/blob'

import {
  parseFy,
  isPartialFy,
  listAllEntities,
  getEntityTransactions,
  getEntityAssumptions,
  getCoverageGaps,
  type FyRange,
  type EntityRow,
  type EntityTxn,
} from './queries'
import { scanInvoiceFolder, downloadInvoiceFile } from '@/lib/gdrive/scan-invoices'
import { CoverSheet, type CoverSheetData } from '@/lib/financials/tax-pdf/cover-sheet'
import { EntityReport, type EntityReportData } from '@/lib/financials/tax-pdf/entity-report'
import { ATO_CODE_LABELS } from '@/lib/financials/ato-codes'
import { isClaudeAtoEnabled } from '@/lib/app-settings'
import { db } from '@/lib/db'
import { invoiceTags, financialStatements, financialAccounts } from '@/lib/db/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface BundlerInput {
  fy: string // 'FY2025-26'
  entityIds?: string[] // null/undefined = all entities
  driveToken: {
    accessToken: string
    refreshToken?: string | null
    tokenExpiry?: Date | null
  } | null // null = skip Drive scan
}

export interface BundlerOutput {
  blobUrl: string
  filename: string
  sizeBytes: number
  entityCount: number
  totalTxns: number
  totalInvoices: number
}

export interface BundlerProgress {
  step: string
  percent: number
}

export type BundlerOnProgress = (progress: BundlerProgress) => void | Promise<void>

// -----------------------------------------------------------------------------
// Main entry point
// -----------------------------------------------------------------------------

export async function buildExportZip(
  input: BundlerInput,
  onProgress: BundlerOnProgress = () => {}
): Promise<BundlerOutput> {
  const fyRange = parseFy(input.fy)
  const partial = isPartialFy(fyRange)
  const generatedAt = new Date().toISOString()
  const claudeEnabled = await isClaudeAtoEnabled()

  await onProgress({ step: 'Loading entities', percent: 5 })

  const allEntities = await listAllEntities()
  const entities = input.entityIds
    ? allEntities.filter(e => input.entityIds!.includes(e.id))
    : allEntities

  if (entities.length === 0) {
    throw new Error('No entities selected for export')
  }

  const zip = new JSZip()
  const entitySummaries: CoverSheetData['entities'] = []
  let totalTxns = 0
  let totalInvoices = 0
  let totalOutstanding = 0

  // Process each entity
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]
    const baseProgress = 10 + (80 * i) / entities.length
    await onProgress({
      step: `Processing ${entity.name}`,
      percent: Math.round(baseProgress),
    })

    const folderName = `${String(i + 1).padStart(2, '0')}-${sanitizeFolderName(entity.name)}`
    const entityFolder = zip.folder(folderName)!

    // Fetch data
    const txns = await getEntityTransactions(entity.id, fyRange)
    const assumptions = await getEntityAssumptions(entity.id, fyRange)
    const coverageGaps = await getCoverageGaps(entity.id, fyRange)
    totalTxns += txns.length

    // Compute entity report data
    const reportData = buildEntityReportData({
      entity,
      fy: fyRange,
      partial,
      generatedAt,
      txns,
      assumptions,
    })

    // Collect outstanding items
    const outstandingItems = collectOutstandingItems({
      entity,
      fy: fyRange,
      txns,
      assumptions,
      coverageGaps,
    })
    reportData.outstandingItems = outstandingItems
    totalOutstanding += outstandingItems.length

    // Render entity PDF
    await onProgress({
      step: `Rendering ${entity.name} report`,
      percent: Math.round(baseProgress + 30 / entities.length),
    })
    const pdfBuffer = await renderToBuffer(EntityReport({ data: reportData }) as any)
    entityFolder.file(`${sanitizeFolderName(entity.name)}-Report.pdf`, pdfBuffer)

    // Generate CSVs
    entityFolder.file('transactions.csv', generateTransactionsCsv(txns, entity))
    entityFolder.file('expenses-by-ato-code.csv', generateExpensesByAtoCsv(reportData))
    entityFolder.file('income-summary.csv', generateIncomeCsv(reportData))
    entityFolder.file('assumptions-applied.csv', generateAssumptionsCsv(assumptions))
    entityFolder.file('outstanding-items.csv', generateOutstandingItemsCsv(outstandingItems))
    if (entity.type === 'business' || entity.type === 'trust') {
      entityFolder.file('gst-summary.csv', generateGstSummaryCsv(reportData))
    }

    // Drive scan + invoice bundling
    let invoiceCount = 0
    if (input.driveToken && entity.invoiceDriveFolder) {
      await onProgress({
        step: `Scanning invoices for ${entity.name}`,
        percent: Math.round(baseProgress + 60 / entities.length),
      })
      try {
        const scan = await scanInvoiceFolder(input.driveToken, entity.invoiceDriveFolder)
        const invoicesFolder = entityFolder.folder('invoices')!

        // Fetch any existing tags for this entity+FY
        const tags = await db
          .select()
          .from(invoiceTags)
          .where(and(eq(invoiceTags.entityId, entity.id), eq(invoiceTags.fy, fyRange.label)))
        const tagsByFileId = new Map(tags.map(t => [t.gdriveFileId, t]))

        // Download each file
        for (const file of scan.files) {
          try {
            const { buffer } = await downloadInvoiceFile(input.driveToken, file.id)
            const safeName = `${sanitizeFilename(file.name)}`
            invoicesFolder.file(safeName, buffer)
            invoiceCount++
          } catch (err) {
            console.error(`Failed to download invoice ${file.id}:`, err)
          }
        }

        // Generate invoices-index.csv
        entityFolder.file(
          'invoices-index.csv',
          generateInvoicesIndexCsv(scan.files, tagsByFileId)
        )

        if (scan.truncated) {
          // Add a marker so the accountant knows there are more
          invoicesFolder.file(
            'README.txt',
            `This folder was truncated at 500 files. Check the Drive folder directly for the full list.`
          )
        }
      } catch (err: any) {
        // Drive error doesn't fail the whole export — log to folder
        entityFolder.file(
          'invoices-SCAN-ERROR.txt',
          `Drive scan failed for folder: ${entity.invoiceDriveFolder}\nError: ${err?.message ?? String(err)}\nExport continued without invoices for this entity.`
        )
      }
    }
    totalInvoices += invoiceCount

    // Record summary for cover sheet
    entitySummaries.push({
      name: entity.name,
      type: entity.type,
      transactionCount: txns.length,
      totalIncome: reportData.totalIncome,
      totalExpenses: reportData.totalExpenses,
      totalDeductible: reportData.totalDeductible,
      outstandingItemCount: outstandingItems.length,
    })
  }

  // Build cover sheet
  await onProgress({ step: 'Rendering cover sheet', percent: 92 })
  const coverData: CoverSheetData = {
    fy: fyRange.label,
    fyStartDate: fyRange.startDate,
    fyEndDate: fyRange.endDate,
    isPartialYear: partial,
    generatedAt,
    entities: entitySummaries,
    totalOutstandingItems: totalOutstanding,
    claudeEnhancedSuggestions: claudeEnabled,
  }
  const coverPdfBuffer = await renderToBuffer(CoverSheet({ data: coverData }) as any)
  zip.file('00-Cover-Sheet.pdf', coverPdfBuffer)

  // README
  zip.file('README.txt', buildReadme(coverData))

  // Generate ZIP
  await onProgress({ step: 'Building ZIP', percent: 96 })
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  // Upload to Vercel Blob
  await onProgress({ step: 'Uploading to storage', percent: 98 })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `Boctor-Accountant-Pack-${fyRange.label}_${timestamp}.zip`
  const blobResult = await put(`tax-exports/${filename}`, zipBuffer, {
    access: 'public',
    contentType: 'application/zip',
    addRandomSuffix: false,
    allowOverwrite: true,
  })

  await onProgress({ step: 'Complete', percent: 100 })

  return {
    blobUrl: blobResult.url,
    filename,
    sizeBytes: zipBuffer.length,
    entityCount: entities.length,
    totalTxns,
    totalInvoices,
  }
}

// -----------------------------------------------------------------------------
// Report data builder — groups txns by ATO code, splits income vs expenses
// -----------------------------------------------------------------------------

function buildEntityReportData(args: {
  entity: EntityRow
  fy: FyRange
  partial: boolean
  generatedAt: string
  txns: EntityTxn[]
  assumptions: Array<{ type: string; valueNumeric: number | null; valueText: string | null; rationale: string | null }>
}): EntityReportData {
  const { entity, fy, partial, generatedAt, txns, assumptions } = args
  const isCompanyScope = entity.type === 'business' || entity.type === 'trust'

  const income = txns.filter(t => Number(t.amount) > 0)
  const expenses = txns.filter(t => Number(t.amount) < 0)

  // Pick the right ATO code column based on entity type
  const getAto = (t: EntityTxn): string | null =>
    isCompanyScope
      ? (t.atoCodeCompany ?? t.aiSuggestedAtoCodeCompany)
      : (t.atoCodePersonal ?? t.aiSuggestedAtoCodePersonal)

  // Expense rows grouped by ATO code
  const expenseGroups = new Map<string, EntityReportData['expenseRowsByAtoCode'][number]>()
  for (const t of expenses) {
    const code = getAto(t)
    const key = code ?? '__UNMAPPED__'
    if (!expenseGroups.has(key)) {
      expenseGroups.set(key, {
        atoCode: code,
        atoLabel: code ? (ATO_CODE_LABELS[code] ?? code) : 'Unmapped / private',
        subtotal: 0,
        deductibleSubtotal: 0,
        transactions: [],
      })
    }
    const group = expenseGroups.get(key)!
    const absAmt = Math.abs(Number(t.amount))
    const amtToUse = isCompanyScope && t.amountExGst !== null ? Math.abs(t.amountExGst) : absAmt
    group.subtotal += amtToUse
    if (t.isTaxDeductible) {
      group.deductibleSubtotal += amtToUse
    }
    group.transactions.push({
      date: t.date,
      merchant: t.merchantName ?? '—',
      description: t.descriptionRaw ?? '—',
      amount: amtToUse,
      isDeductible: t.isTaxDeductible,
    })
  }

  // Sort groups: deductible first, then by subtotal desc
  const expenseRowsByAtoCode = Array.from(expenseGroups.values()).sort((a, b) => {
    if (a.deductibleSubtotal > 0 && b.deductibleSubtotal === 0) return -1
    if (b.deductibleSubtotal > 0 && a.deductibleSubtotal === 0) return 1
    return b.subtotal - a.subtotal
  })

  // Income rows (flat list, not grouped)
  const incomeRows: EntityReportData['incomeRows'] = income.map(t => {
    const code = getAto(t)
    return {
      atoCode: code,
      atoLabel: code ? (ATO_CODE_LABELS[code] ?? code) : 'Uncategorised income',
      description: `${t.date} · ${t.merchantName ?? t.descriptionRaw ?? '—'}`,
      amount: Number(t.amount),
      isDeductible: false,
    }
  })

  // Totals
  const totalIncome = income.reduce((s, t) => s + Number(t.amount), 0)
  const totalExpenses = expenses.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const totalDeductible = expenses
    .filter(t => t.isTaxDeductible)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const totalNonDeductible = totalExpenses - totalDeductible

  // GST summary (business entities only)
  let gstSummary: EntityReportData['gstSummary'] | undefined
  if (isCompanyScope) {
    const totalGstCollected = income.reduce((s, t) => s + (t.gstAmount !== null ? Number(t.gstAmount) : 0), 0)
    const totalGstPaid = expenses.reduce((s, t) => s + (t.gstAmount !== null ? Math.abs(Number(t.gstAmount)) : 0), 0)
    const anyNull = txns.some(t => t.amountExGst === null)
    gstSummary = {
      totalGstCollected,
      totalGstPaid,
      netGst: totalGstCollected - totalGstPaid,
      notice: anyNull
        ? 'Some transactions have null ex-GST amounts. Run Phase E (GST Auto-Calculation) to populate.'
        : null,
    }
  }

  return {
    entityName: entity.name,
    entityType: entity.type,
    fy: fy.label,
    fyStartDate: fy.startDate,
    fyEndDate: fy.endDate,
    isPartialYear: partial,
    generatedAt,
    incomeRows,
    expenseRowsByAtoCode,
    totalIncome,
    totalExpenses,
    totalDeductible,
    totalNonDeductible,
    gstSummary,
    assumptions: assumptions.map(a => ({
      type: a.type,
      value:
        a.valueNumeric !== null
          ? `${a.valueNumeric}${a.type.endsWith('_pct') || a.type.endsWith('_percentage') ? '%' : ''}`
          : (a.valueText ?? '—'),
      rationale: a.rationale,
    })),
    outstandingItems: [], // populated by caller
  }
}

// -----------------------------------------------------------------------------
// Outstanding items collector
// -----------------------------------------------------------------------------

function collectOutstandingItems(args: {
  entity: EntityRow
  fy: FyRange
  txns: EntityTxn[]
  assumptions: Array<{ type: string; valueNumeric: number | null; valueText: string | null }>
  coverageGaps: string[]
}): Array<{ type: string; description: string }> {
  const items: Array<{ type: string; description: string }> = []
  const isCompanyScope = args.entity.type === 'business' || args.entity.type === 'trust'

  // Uncategorised transactions
  const uncat = args.txns.filter(t => !t.category || t.category === 'OTHER')
  if (uncat.length > 0) {
    items.push({
      type: 'uncategorised',
      description: `${uncat.length} transaction${uncat.length > 1 ? 's' : ''} have no category assigned`,
    })
  }

  // Transactions with no confirmed ATO code (in the relevant scope)
  const noAto = args.txns.filter(t => {
    const confirmed = isCompanyScope ? t.atoCodeCompany : t.atoCodePersonal
    const suggested = isCompanyScope ? t.aiSuggestedAtoCodeCompany : t.aiSuggestedAtoCodePersonal
    return !confirmed && !!suggested
  })
  if (noAto.length > 0) {
    items.push({
      type: 'unreviewed_ato',
      description: `${noAto.length} transaction${noAto.length > 1 ? 's have' : ' has'} AI-suggested ATO codes awaiting review`,
    })
  }

  // Coverage gaps
  for (const month of args.coverageGaps) {
    items.push({
      type: 'missing_statement',
      description: `No statement imported for ${month}`,
    })
  }

  // Missing assumptions (business entities)
  if (isCompanyScope) {
    const hasGstFlag = args.assumptions.some(a => a.type === 'gst_registered' || a.type === 'gst_status')
    if (!hasGstFlag) {
      items.push({
        type: 'missing_assumption',
        description: `GST-registered flag not set for ${args.fy.label}`,
      })
    }
  } else {
    // Personal: check for WFH % if any work-from-home expenses are present
    const hasWfhExpenses = args.txns.some(t =>
      t.atoCodePersonal === 'D5' || t.aiSuggestedAtoCodePersonal === 'D5'
    )
    if (hasWfhExpenses) {
      const hasWfh = args.assumptions.some(a =>
        a.type === 'wfh_percentage' || a.type === 'wfh_pct' || a.type === 'work_from_home_pct'
      )
      if (!hasWfh) {
        items.push({
          type: 'missing_assumption',
          description: `WFH percentage not set for ${args.fy.label} (D5 expenses present)`,
        })
      }
    }
  }

  return items
}

// -----------------------------------------------------------------------------
// CSV generators
// -----------------------------------------------------------------------------

function generateTransactionsCsv(txns: EntityTxn[], entity: EntityRow): string {
  const isCompany = entity.type === 'business' || entity.type === 'trust'
  const rows = txns.map(t => ({
    date: t.date,
    merchant: t.merchantName ?? '',
    description: t.descriptionRaw ?? '',
    category: t.category ?? '',
    subcategory: t.subcategory ?? '',
    amount: t.amount,
    amount_ex_gst: t.amountExGst ?? '',
    gst_amount: t.gstAmount ?? '',
    ato_code: isCompany ? (t.atoCodeCompany ?? t.aiSuggestedAtoCodeCompany ?? '') : (t.atoCodePersonal ?? t.aiSuggestedAtoCodePersonal ?? ''),
    ato_code_source: (isCompany ? t.atoCodeCompany : t.atoCodePersonal) ? 'confirmed' : (isCompany ? t.aiSuggestedAtoCodeCompany : t.aiSuggestedAtoCodePersonal) ? 'ai_suggested' : 'none',
    is_tax_deductible: t.isTaxDeductible ? 'yes' : 'no',
    bank: t.bankName ?? '',
    account: t.accountName ?? '',
  }))
  return Papa.unparse(rows, { header: true })
}

function generateExpensesByAtoCsv(data: EntityReportData): string {
  const rows = data.expenseRowsByAtoCode.map(g => ({
    ato_code: g.atoCode ?? '',
    ato_label: g.atoLabel,
    subtotal: g.subtotal.toFixed(2),
    deductible_subtotal: g.deductibleSubtotal.toFixed(2),
    non_deductible_subtotal: (g.subtotal - g.deductibleSubtotal).toFixed(2),
    transaction_count: g.transactions.length,
  }))
  return Papa.unparse(rows, { header: true })
}

function generateIncomeCsv(data: EntityReportData): string {
  const rows = data.incomeRows.map(r => ({
    ato_code: r.atoCode ?? '',
    ato_label: r.atoLabel,
    description: r.description,
    amount: r.amount.toFixed(2),
  }))
  return Papa.unparse(rows, { header: true })
}

function generateAssumptionsCsv(
  assumptions: Array<{ type: string; valueNumeric: number | null; valueText: string | null; rationale: string | null }>
): string {
  const rows = assumptions.map(a => ({
    type: a.type,
    value_numeric: a.valueNumeric ?? '',
    value_text: a.valueText ?? '',
    rationale: a.rationale ?? '',
  }))
  return Papa.unparse(rows, { header: true })
}

function generateOutstandingItemsCsv(items: Array<{ type: string; description: string }>): string {
  const rows = items.map(i => ({ type: i.type, description: i.description }))
  return Papa.unparse(rows, { header: true })
}

function generateGstSummaryCsv(data: EntityReportData): string {
  if (!data.gstSummary) return 'no data\n'
  const rows = [
    { line: 'GST collected (on income)', amount: data.gstSummary.totalGstCollected.toFixed(2) },
    { line: 'GST paid (on expenses)', amount: data.gstSummary.totalGstPaid.toFixed(2) },
    { line: 'Net GST position', amount: data.gstSummary.netGst.toFixed(2) },
  ]
  let output = Papa.unparse(rows, { header: true })
  if (data.gstSummary.notice) {
    output += `\nNOTICE,${JSON.stringify(data.gstSummary.notice)}\n`
  }
  return output
}

function generateInvoicesIndexCsv(
  files: Array<{ id: string; name: string; modifiedTime: string; sizeBytes: number | null }>,
  tagsByFileId: Map<string, { supplier: string | null; amount: string | null; atoCodePersonal: string | null; atoCodeCompany: string | null; linkedTxnId: string | null; matchStatus: string | null; notes: string | null }>
): string {
  const rows = files.map(f => {
    const tag = tagsByFileId.get(f.id)
    return {
      filename: f.name,
      date: f.modifiedTime.slice(0, 10),
      supplier: tag?.supplier ?? '',
      amount: tag?.amount ?? '',
      ato_code: tag?.atoCodePersonal ?? tag?.atoCodeCompany ?? '',
      linked_txn_id: tag?.linkedTxnId ?? '',
      match_status: tag?.matchStatus ?? 'unmatched',
      notes: tag?.notes ?? '',
    }
  })
  return Papa.unparse(rows, { header: true })
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function sanitizeFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 50)
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, '_').slice(0, 120)
}

function buildReadme(data: CoverSheetData): string {
  return `Boctor Family Hub — Accountant Pack
Financial Year: ${data.fy}
Generated: ${data.generatedAt}

STRUCTURE:
  00-Cover-Sheet.pdf       — executive summary across all entities
  01-Personal/             — Individual tax return (Maged, Mandy, family)
  02-D3-Pty-Ltd/           — Company tax return
  03-Babyccino-Pty-Ltd/    — Company tax return
  (or similar, one folder per entity included in this export)

Each entity folder contains:
  {Entity}-Report.pdf       — Full P&L with ATO code breakdown
  transactions.csv          — Every transaction in the FY
  expenses-by-ato-code.csv  — Grouped expenses by ATO code line
  income-summary.csv        — Income by source
  assumptions-applied.csv   — FY assumptions snapshot (WFH %, vehicle %, etc.)
  outstanding-items.csv     — Data-quality gaps flagged for review
  invoices/                 — Supplier invoices from Google Drive
  invoices-index.csv        — Invoice file → transaction matching

Business entity folders additionally include:
  gst-summary.csv           — GST collected / paid / net position

ATO code scheme:
  Personal entities use Individual Tax Return codes:
    I-1, I-10, I-11, I-13, I-18, I-24   (Income items)
    D1, D2, D3, D4, D5, D9, D10, D12, D15  (Deduction items)

  Business entities use Company Tax Return Item 6 codes:
    6-INCOME, 6-INT-REC, 6-DIV-REC, 6-OTHER-INC  (income)
    6-COGS, 6-CONTRACT, 6-WAGES, 6-SUPER, 6-RENT, 6-MV, 6-DEPN, 6-REPAIRS, etc.
    6-OTHER-EXP                                   (form rollup catchall)
    6-OTHER-*                                     (internal sub-codes)

The 6-OTHER-* internal sub-codes all roll up to "6-OTHER-EXP" on the form.
Use the internal breakdown for bookkeeping; use the rollup for the return.

Questions or issues: contact Maged.
`
}
