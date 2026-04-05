/**
 * Accountant Pack cover sheet — top-level PDF in the ZIP.
 *
 * Summarises all entities included in the export. One page.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles } from './styles'
import { ReportFooter, formatAUD0 } from './shared'

export interface CoverSheetData {
  fy: string
  fyStartDate: string // ISO
  fyEndDate: string // ISO
  isPartialYear: boolean // true if FY hasn't ended yet
  generatedAt: string // ISO
  entities: Array<{
    name: string
    type: 'personal' | 'business' | 'trust'
    transactionCount: number
    totalIncome: number
    totalExpenses: number
    totalDeductible: number
    outstandingItemCount: number
  }>
  totalOutstandingItems: number
  claudeEnhancedSuggestions: boolean // whether Claude was used for proposals
}

export function CoverSheet({ data }: { data: CoverSheetData }) {
  const generatedDisplay = new Date(data.generatedAt).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.coverTitle}>Accountant Pack</Text>
        <Text style={styles.coverSubtitle}>
          Boctor Family — {data.fy}
          {data.isPartialYear && ' (Year-to-date)'}
        </Text>

        <View style={styles.coverMetaBox}>
          <Text style={styles.coverMetaLabel}>Financial year</Text>
          <Text style={styles.coverMetaValue}>
            {data.fy} · {data.fyStartDate} → {data.fyEndDate}
          </Text>

          <Text style={styles.coverMetaLabel}>Entities included</Text>
          <Text style={styles.coverMetaValue}>{data.entities.length}</Text>

          <Text style={styles.coverMetaLabel}>Total outstanding items</Text>
          <Text style={styles.coverMetaValue}>
            {data.totalOutstandingItems}
            {data.totalOutstandingItems > 0 && ' — see individual entity reports'}
          </Text>

          <Text style={styles.coverMetaLabel}>Generated</Text>
          <Text style={styles.coverMetaValue}>{generatedDisplay}</Text>
        </View>

        <Text style={styles.sectionHeading}>Summary per entity</Text>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, { flex: 4 }]}>Entity</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Type</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Txns</Text>
            <Text style={[styles.tableHeaderCell, { flex: 3, textAlign: 'right' }]}>Income</Text>
            <Text style={[styles.tableHeaderCell, { flex: 3, textAlign: 'right' }]}>Expenses</Text>
            <Text style={[styles.tableHeaderCell, { flex: 3, textAlign: 'right' }]}>Deductible</Text>
          </View>
          {data.entities.map((entity, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCellBold, { flex: 4 }]}>{entity.name}</Text>
              <Text style={[styles.tableCell, { flex: 2 }]}>{entity.type}</Text>
              <Text style={[styles.tableCellRight, { flex: 2 }]}>{entity.transactionCount}</Text>
              <Text style={[styles.tableCellRight, { flex: 3 }]}>{formatAUD0(entity.totalIncome)}</Text>
              <Text style={[styles.tableCellRight, { flex: 3 }]}>{formatAUD0(entity.totalExpenses)}</Text>
              <Text style={[styles.tableCellRight, { flex: 3 }]}>{formatAUD0(entity.totalDeductible)}</Text>
            </View>
          ))}
          <View style={styles.tableRowTotal}>
            <Text style={[styles.tableCellBold, { flex: 4 }]}>Total</Text>
            <Text style={[styles.tableCell, { flex: 2 }]}></Text>
            <Text style={[styles.tableCellRightBold, { flex: 2 }]}>
              {data.entities.reduce((s, e) => s + e.transactionCount, 0)}
            </Text>
            <Text style={[styles.tableCellRightBold, { flex: 3 }]}>
              {formatAUD0(data.entities.reduce((s, e) => s + e.totalIncome, 0))}
            </Text>
            <Text style={[styles.tableCellRightBold, { flex: 3 }]}>
              {formatAUD0(data.entities.reduce((s, e) => s + e.totalExpenses, 0))}
            </Text>
            <Text style={[styles.tableCellRightBold, { flex: 3 }]}>
              {formatAUD0(data.entities.reduce((s, e) => s + e.totalDeductible, 0))}
            </Text>
          </View>
        </View>

        {data.isPartialYear && (
          <Text style={styles.warning}>
            ⚠ This FY is still in progress. Totals are year-to-date as at {data.fyEndDate}.
            Final figures will differ once the FY closes on 30 June.
          </Text>
        )}

        {!data.claudeEnhancedSuggestions && (
          <Text style={styles.note}>
            Note: ATO code proposals in this pack are rule-based. AI-enhanced proposals (Claude) are
            currently disabled in Settings. See the per-entity outstanding items for any
            transactions that may need manual review.
          </Text>
        )}

        <Text style={styles.sectionHeading}>What's in this pack</Text>
        <Text style={styles.tableCell}>
          This ZIP contains one subfolder per entity. Each entity folder includes:
          {'\n'}• {`{Entity}-Report.pdf`} — full P&amp;L with ATO code breakdown
          {'\n'}• transactions.csv — every transaction in the FY
          {'\n'}• expenses-by-ato-code.csv — grouped for return preparation
          {'\n'}• income-summary.csv — income by type
          {'\n'}• assumptions-applied.csv — FY assumptions snapshot
          {'\n'}• outstanding-items.csv — data-quality gaps flagged for review
          {'\n'}• invoices/ — supplier invoices from Google Drive
          {'\n'}• invoices-index.csv — invoice → transaction matching
          {'\n'}Business entities also include gst-summary.csv.
        </Text>

        <ReportFooter pageLabel="Cover Sheet" generatedAt={generatedDisplay} />
      </Page>
    </Document>
  )
}
