/**
 * Shared StyleSheet for tax prep PDFs.
 * @react-pdf/renderer uses a subset of CSS via StyleSheet.create().
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { StyleSheet } from '@react-pdf/renderer'

export const PALETTE = {
  primary: '#1E3A8A', // blue-900
  primaryLight: '#DBEAFE', // blue-100
  text: '#111827', // gray-900
  textMuted: '#6B7280', // gray-500
  textLight: '#9CA3AF', // gray-400
  border: '#E5E7EB', // gray-200
  borderLight: '#F3F4F6', // gray-100
  bgMuted: '#F9FAFB', // gray-50
  success: '#059669', // emerald-600
  warning: '#D97706', // amber-600
  danger: '#DC2626', // red-600
  deductibleHighlight: '#FEF3C7', // amber-100
}

export const styles = StyleSheet.create({
  // Page layout
  page: {
    padding: 40,
    fontSize: 9,
    color: PALETTE.text,
    fontFamily: 'Helvetica',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: PALETTE.primary,
    paddingBottom: 8,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: PALETTE.primary,
  },
  headerSubtitle: {
    fontSize: 10,
    color: PALETTE.textMuted,
    marginTop: 2,
  },
  headerMeta: {
    fontSize: 8,
    color: PALETTE.textMuted,
    textAlign: 'right',
  },

  // Section headings
  sectionHeading: {
    fontSize: 12,
    fontWeight: 'bold',
    color: PALETTE.primary,
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border,
    paddingBottom: 3,
  },

  // Summary boxes
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    color: PALETTE.textMuted,
    fontSize: 9,
  },
  summaryValue: {
    fontWeight: 'bold',
    fontSize: 9,
  },
  summaryValueLarge: {
    fontWeight: 'bold',
    fontSize: 14,
    color: PALETTE.primary,
  },

  // Tables
  table: {
    width: '100%',
    marginTop: 4,
    marginBottom: 8,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: PALETTE.primary,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableHeaderCell: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: PALETTE.borderLight,
  },
  tableRowDeductible: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: PALETTE.borderLight,
    backgroundColor: PALETTE.deductibleHighlight,
  },
  tableRowTotal: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: PALETTE.primary,
    backgroundColor: PALETTE.bgMuted,
  },
  tableCell: {
    fontSize: 8,
  },
  tableCellBold: {
    fontSize: 8,
    fontWeight: 'bold',
  },
  tableCellRight: {
    fontSize: 8,
    textAlign: 'right',
  },
  tableCellRightBold: {
    fontSize: 8,
    textAlign: 'right',
    fontWeight: 'bold',
  },

  // Column widths (used via flex)
  col1: { flex: 1 },
  col2: { flex: 2 },
  col3: { flex: 3 },
  col4: { flex: 4 },
  col5: { flex: 5 },

  // Notes / callouts
  note: {
    fontSize: 8,
    color: PALETTE.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 4,
  },
  warning: {
    fontSize: 8,
    color: PALETTE.warning,
    backgroundColor: '#FEF3C7',
    padding: 6,
    borderRadius: 3,
    marginVertical: 4,
  },

  // Outstanding items badges
  itemRow: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  itemBadge: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#FFFFFF',
    backgroundColor: PALETTE.warning,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    marginRight: 4,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: PALETTE.textLight,
    textAlign: 'center',
    borderTopWidth: 0.5,
    borderTopColor: PALETTE.borderLight,
    paddingTop: 4,
  },

  // Cover sheet specifics
  coverTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: PALETTE.primary,
    textAlign: 'center',
    marginTop: 80,
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 14,
    color: PALETTE.textMuted,
    textAlign: 'center',
    marginBottom: 40,
  },
  coverMetaBox: {
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 4,
    padding: 16,
    marginVertical: 20,
  },
  coverMetaLabel: {
    fontSize: 9,
    color: PALETTE.textMuted,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  coverMetaValue: {
    fontSize: 12,
    color: PALETTE.text,
    fontWeight: 'bold',
    marginBottom: 2,
  },
})
