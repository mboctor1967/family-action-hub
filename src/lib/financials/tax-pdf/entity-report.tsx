/**
 * Per-entity tax report PDF.
 *
 * Full P&L with deductibles highlighted, assumptions snapshot, outstanding items.
 * GST summary included for business entities.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles } from './styles'
import { ReportHeader, SectionHeading, ReportFooter, OutstandingItemRow, formatAUD, formatAUD0 } from './shared'

export interface EntityReportData {
  entityName: string
  entityType: 'personal' | 'business' | 'trust'
  fy: string
  fyStartDate: string
  fyEndDate: string
  isPartialYear: boolean
  generatedAt: string

  incomeRows: Array<{
    atoCode: string | null
    atoLabel: string
    description: string // e.g. merchant/category
    amount: number
    isDeductible: boolean // for consistency, income rows are never "deductible"
  }>

  expenseRowsByAtoCode: Array<{
    atoCode: string | null
    atoLabel: string
    subtotal: number
    deductibleSubtotal: number
    transactions: Array<{
      date: string
      merchant: string
      description: string
      amount: number
      isDeductible: boolean
    }>
  }>

  totalIncome: number
  totalExpenses: number
  totalDeductible: number
  totalNonDeductible: number

  gstSummary?: {
    totalGstCollected: number
    totalGstPaid: number
    netGst: number
    notice: string | null // e.g. "Phase E pending — gross amounts used"
  }

  assumptions: Array<{
    type: string
    value: string
    rationale: string | null
  }>

  outstandingItems: Array<{
    type: string
    description: string
  }>
}

export function EntityReport({ data }: { data: EntityReportData }) {
  const generatedDisplay = new Date(data.generatedAt).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const hasData = data.incomeRows.length > 0 || data.expenseRowsByAtoCode.length > 0

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <ReportHeader
          title={`${data.entityName} — ${data.fy}`}
          subtitle={`${data.entityType.charAt(0).toUpperCase() + data.entityType.slice(1)} entity · ${data.fyStartDate} → ${data.fyEndDate}${data.isPartialYear ? ' (YTD)' : ''}`}
          meta={`Generated ${generatedDisplay}`}
        />

        {!hasData && (
          <View style={{ marginTop: 40, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: '#6B7280' }}>
              No transactions found for {data.entityName} in {data.fy}
            </Text>
            <Text style={styles.note}>
              Import statements for this entity via /financials/import before running the export.
            </Text>
          </View>
        )}

        {hasData && (
          <>
            {/* Executive summary */}
            <SectionHeading>Executive summary</SectionHeading>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <Text style={[styles.summaryLabel, { flex: 3 }]}>Total income</Text>
                <Text style={[styles.summaryValue, { flex: 2, textAlign: 'right' }]}>
                  {formatAUD(data.totalIncome)}
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={[styles.summaryLabel, { flex: 3 }]}>Total expenses</Text>
                <Text style={[styles.summaryValue, { flex: 2, textAlign: 'right' }]}>
                  {formatAUD(data.totalExpenses)}
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={[styles.summaryLabel, { flex: 3 }]}>Deductible expenses</Text>
                <Text style={[styles.summaryValue, { flex: 2, textAlign: 'right', color: '#059669' }]}>
                  {formatAUD(data.totalDeductible)}
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={[styles.summaryLabel, { flex: 3 }]}>Non-deductible expenses</Text>
                <Text style={[styles.summaryValue, { flex: 2, textAlign: 'right', color: '#6B7280' }]}>
                  {formatAUD(data.totalNonDeductible)}
                </Text>
              </View>
              <View style={styles.tableRowTotal}>
                <Text style={[styles.tableCellBold, { flex: 3 }]}>Net position</Text>
                <Text style={[styles.tableCellRightBold, { flex: 2 }]}>
                  {formatAUD(data.totalIncome - data.totalExpenses)}
                </Text>
              </View>
            </View>

            {/* Income */}
            {data.incomeRows.length > 0 && (
              <>
                <SectionHeading>Income</SectionHeading>
                <View style={styles.table}>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Code</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 4 }]}>Category</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 4 }]}>Description</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 3, textAlign: 'right' }]}>Amount</Text>
                  </View>
                  {data.incomeRows.map((row, i) => (
                    <View key={i} style={styles.tableRow}>
                      <Text style={[styles.tableCell, { flex: 2 }]}>{row.atoCode ?? '—'}</Text>
                      <Text style={[styles.tableCell, { flex: 4 }]}>{row.atoLabel}</Text>
                      <Text style={[styles.tableCell, { flex: 4 }]}>{row.description}</Text>
                      <Text style={[styles.tableCellRight, { flex: 3 }]}>
                        {formatAUD(row.amount)}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.tableRowTotal}>
                    <Text style={[styles.tableCellBold, { flex: 10 }]}>Total income</Text>
                    <Text style={[styles.tableCellRightBold, { flex: 3 }]}>{formatAUD(data.totalIncome)}</Text>
                  </View>
                </View>
              </>
            )}

            {/* Expenses by ATO code */}
            {data.expenseRowsByAtoCode.length > 0 && (
              <>
                <SectionHeading>Expenses by ATO code (full P&amp;L — deductibles highlighted)</SectionHeading>
                {data.expenseRowsByAtoCode.map((group, gi) => (
                  <View key={gi} style={{ marginBottom: 8 }} wrap={false}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        backgroundColor: '#DBEAFE',
                        paddingVertical: 3,
                        paddingHorizontal: 6,
                      }}
                    >
                      <Text style={[styles.tableCellBold, { flex: 6 }]}>
                        {group.atoCode ?? '(unmapped)'} — {group.atoLabel}
                      </Text>
                      <Text style={[styles.tableCellRightBold, { flex: 2 }]}>
                        {formatAUD(group.subtotal)}
                      </Text>
                      {group.deductibleSubtotal !== group.subtotal && (
                        <Text style={[styles.tableCellRightBold, { flex: 2, color: '#059669' }]}>
                          (Deductible: {formatAUD(group.deductibleSubtotal)})
                        </Text>
                      )}
                    </View>
                    {group.transactions.slice(0, 20).map((txn, ti) => (
                      <View key={ti} style={txn.isDeductible ? styles.tableRowDeductible : styles.tableRow}>
                        <Text style={[styles.tableCell, { flex: 2 }]}>{txn.date}</Text>
                        <Text style={[styles.tableCell, { flex: 4 }]}>{txn.merchant}</Text>
                        <Text style={[styles.tableCell, { flex: 5 }]}>{txn.description}</Text>
                        <Text style={[styles.tableCellRight, { flex: 2 }]}>{formatAUD(txn.amount)}</Text>
                      </View>
                    ))}
                    {group.transactions.length > 20 && (
                      <Text style={styles.note}>
                        … {group.transactions.length - 20} more transactions in this category — see
                        transactions.csv for the full list
                      </Text>
                    )}
                  </View>
                ))}
              </>
            )}

            {/* GST summary (business entities only) */}
            {data.gstSummary && (
              <>
                <SectionHeading>GST summary</SectionHeading>
                {data.gstSummary.notice && <Text style={styles.warning}>{data.gstSummary.notice}</Text>}
                <View style={styles.table}>
                  <View style={styles.tableRow}>
                    <Text style={[styles.summaryLabel, { flex: 3 }]}>GST collected (on income)</Text>
                    <Text style={[styles.summaryValue, { flex: 2, textAlign: 'right' }]}>
                      {formatAUD(data.gstSummary.totalGstCollected)}
                    </Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={[styles.summaryLabel, { flex: 3 }]}>GST paid (on expenses)</Text>
                    <Text style={[styles.summaryValue, { flex: 2, textAlign: 'right' }]}>
                      {formatAUD(data.gstSummary.totalGstPaid)}
                    </Text>
                  </View>
                  <View style={styles.tableRowTotal}>
                    <Text style={[styles.tableCellBold, { flex: 3 }]}>Net GST position</Text>
                    <Text style={[styles.tableCellRightBold, { flex: 2 }]}>
                      {formatAUD(data.gstSummary.netGst)}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Assumptions snapshot */}
            {data.assumptions.length > 0 && (
              <>
                <SectionHeading>Assumptions applied for {data.fy}</SectionHeading>
                <View style={styles.table}>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Type</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Value</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 6 }]}>Rationale</Text>
                  </View>
                  {data.assumptions.map((a, i) => (
                    <View key={i} style={styles.tableRow}>
                      <Text style={[styles.tableCell, { flex: 3 }]}>{a.type}</Text>
                      <Text style={[styles.tableCellBold, { flex: 3 }]}>{a.value}</Text>
                      <Text style={[styles.tableCell, { flex: 6 }]}>{a.rationale ?? '—'}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Outstanding items */}
            {data.outstandingItems.length > 0 && (
              <>
                <SectionHeading>Outstanding items — review before lodgement</SectionHeading>
                <Text style={styles.warning}>
                  {data.outstandingItems.length} item{data.outstandingItems.length > 1 ? 's' : ''} flagged.
                  See outstanding-items.csv for the full list with resolution links.
                </Text>
                {data.outstandingItems.slice(0, 15).map((item, i) => (
                  <OutstandingItemRow key={i} type={item.type} description={item.description} />
                ))}
                {data.outstandingItems.length > 15 && (
                  <Text style={styles.note}>
                    … {data.outstandingItems.length - 15} more — see outstanding-items.csv
                  </Text>
                )}
              </>
            )}
          </>
        )}

        <ReportFooter
          pageLabel={`${data.entityName} — ${data.fy}`}
          generatedAt={generatedDisplay}
        />
      </Page>
    </Document>
  )
}
