/**
 * Shared PDF components for tax prep reports.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { View, Text } from '@react-pdf/renderer'
import { styles, PALETTE } from './styles'

export function ReportHeader({
  title,
  subtitle,
  meta,
}: {
  title: string
  subtitle?: string
  meta?: string
}) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      </View>
      {meta && <Text style={styles.headerMeta}>{meta}</Text>}
    </View>
  )
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionHeading}>{children}</Text>
}

export function SummaryRow({
  label,
  value,
  large = false,
}: {
  label: string
  value: string
  large?: boolean
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={large ? styles.summaryValueLarge : styles.summaryValue}>{value}</Text>
    </View>
  )
}

export function Note({ children }: { children: React.ReactNode }) {
  return <Text style={styles.note}>{children}</Text>
}

export function WarningBox({ children }: { children: React.ReactNode }) {
  return <Text style={styles.warning}>{children}</Text>
}

/**
 * Generic table renderer.
 * columns: array of { header, flex, align? }
 * rows: 2D array of string cells matching columns
 * deductibleRows: Set<number> of row indices to highlight as deductible
 * totalRow: optional final row with bold styling and top border
 */
export interface TableColumn {
  header: string
  flex: number
  align?: 'left' | 'right'
}

export interface TableProps {
  columns: TableColumn[]
  rows: string[][]
  deductibleRows?: Set<number>
  totalRow?: string[]
}

export function Table({ columns, rows, deductibleRows, totalRow }: TableProps) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        {columns.map((col, i) => (
          <Text
            key={i}
            style={[
              styles.tableHeaderCell,
              { flex: col.flex },
              col.align === 'right' ? { textAlign: 'right' } : {},
            ]}
          >
            {col.header}
          </Text>
        ))}
      </View>
      {rows.map((row, rowIdx) => {
        const isDeductible = deductibleRows?.has(rowIdx)
        return (
          <View key={rowIdx} style={isDeductible ? styles.tableRowDeductible : styles.tableRow}>
            {row.map((cell, cellIdx) => {
              const col = columns[cellIdx]
              const cellStyle =
                col.align === 'right' ? styles.tableCellRight : styles.tableCell
              return (
                <Text key={cellIdx} style={[cellStyle, { flex: col.flex }]}>
                  {cell}
                </Text>
              )
            })}
          </View>
        )
      })}
      {totalRow && (
        <View style={styles.tableRowTotal}>
          {totalRow.map((cell, i) => {
            const col = columns[i]
            const cellStyle =
              col.align === 'right' ? styles.tableCellRightBold : styles.tableCellBold
            return (
              <Text key={i} style={[cellStyle, { flex: col.flex }]}>
                {cell}
              </Text>
            )
          })}
        </View>
      )}
    </View>
  )
}

export function OutstandingItemRow({ type, description }: { type: string; description: string }) {
  return (
    <View style={styles.itemRow}>
      <Text style={styles.itemBadge}>{type.toUpperCase()}</Text>
      <Text style={styles.tableCell}>{description}</Text>
    </View>
  )
}

export function ReportFooter({
  pageLabel,
  generatedAt,
}: {
  pageLabel: string
  generatedAt: string
}) {
  return (
    <Text
      style={styles.footer}
      render={() =>
        `${pageLabel} · Generated ${generatedAt} · Boctor Family Hub`
      }
      fixed
    />
  )
}

export const formatAUD = (n: number): string =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(n)

export const formatAUD0 = (n: number): string =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
