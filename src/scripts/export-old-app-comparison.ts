/**
 * One-off: Export comparison Excel — old standalone app invoices vs hub invoices.
 * Reads the standalone app's output Excel files + queries the hub DB.
 * Outputs: docs/reference/invoice-comparison.xlsx
 *
 * Run: node --env-file=.env.local --import tsx src/scripts/export-old-app-comparison.ts
 */

import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const OLD_APP_DIR = 'C:\\Users\\MagedBoctor\\Claude\\Invoice Reader\\output'
const OUTPUT_FILE = path.join(process.cwd(), 'docs', 'reference', 'invoice-comparison.xlsx')

interface OldInvoice {
  supplier: string
  index: number
  emailType: string
  emailDate: string
  purchaseDate: string
  serviceDate: string
  referenceNumber: string
  invoiceNumber: string
  location: string
  serviceType: string
  subTotal: number | string
  gst: number | string
  totalAmount: number | string
  pdfFile: string
  pdfPath: string
}

function readOldAppExcel(supplierFolder: string, supplierName: string): OldInvoice[] {
  const dir = path.join(OLD_APP_DIR, supplierFolder)
  if (!fs.existsSync(dir)) return []

  // Find the latest summary file
  const files = fs.readdirSync(dir).filter(f => f.includes('Summary') && f.endsWith('.xlsx'))
  if (files.length === 0) return []

  const latest = files.sort().pop()!
  const wb = XLSX.readFile(path.join(dir, latest))

  // Read the Transactions sheet
  const ws = wb.Sheets['Transactions']
  if (!ws) return []

  const rows = XLSX.utils.sheet_to_json<any>(ws)
  return rows
    .filter((r: any) => r['#'] && !isNaN(Number(r['#'])))
    .map((r: any) => ({
      supplier: supplierName,
      index: Number(r['#']),
      emailType: r['Type'] || '',
      emailDate: r['Email Date'] || '',
      purchaseDate: r['Purchase Date'] || '',
      serviceDate: r['Service Date'] || '',
      referenceNumber: r['Reference No.'] || '',
      invoiceNumber: r['Invoice No.'] || '',
      location: r['Location'] || '',
      serviceType: r['Service Type'] || '',
      subTotal: r['Sub-Total (AUD)'] ?? '',
      gst: r['GST (AUD)'] ?? '',
      totalAmount: r['Total (AUD)'] ?? '',
      pdfFile: r['PDF File'] || '',
      pdfPath: r['PDF File'] ? path.join(dir, 'pdfs_*', r['PDF File']) : '', // approximate path
    }))
}

async function main() {
  console.log('Reading standalone app output...')

  const oldInvoices: OldInvoice[] = [
    ...readOldAppExcel('Wilson_Parking', 'Wilson Parking'),
    ...readOldAppExcel('Good_Guys_Mobile', 'Good Guys Mobile'),
    ...readOldAppExcel('Evernote', 'Evernote'),
    ...readOldAppExcel('Microsoft', 'Microsoft'),
  ]

  console.log(`Old app: ${oldInvoices.length} invoices across ${new Set(oldInvoices.map(i => i.supplier)).size} suppliers`)

  // Read hub invoices
  console.log('Reading hub DB...')
  const hubRows = await db.select().from(invoices)
  console.log(`Hub: ${hubRows.length} invoices`)

  // Build the workbook
  const wb = XLSX.utils.book_new()

  // Sheet 1: Old app invoices
  const oldSheet = XLSX.utils.json_to_sheet(oldInvoices.map(i => ({
    'Supplier': i.supplier,
    '#': i.index,
    'Type': i.emailType,
    'Email Date': i.emailDate,
    'Purchase Date': i.purchaseDate,
    'Service Date': i.serviceDate,
    'Reference #': i.referenceNumber,
    'Invoice #': i.invoiceNumber,
    'Location': i.location,
    'Service Type': i.serviceType,
    'Sub-Total': i.subTotal,
    'GST': i.gst,
    'Total': i.totalAmount,
    'PDF File': i.pdfFile,
  })))
  XLSX.utils.book_append_sheet(wb, oldSheet, 'Old App Invoices')

  // Sheet 2: Hub invoices
  const hubSheet = XLSX.utils.json_to_sheet(hubRows.map(h => ({
    'Supplier': h.supplierName ?? '',
    'Invoice #': h.invoiceNumber ?? '',
    'Invoice Date': h.invoiceDate ?? '',
    'Purchase Date': h.purchaseDate ?? '',
    'Service Date': h.serviceDate ?? '',
    'Reference #': h.referenceNumber ?? '',
    'Location': h.location ?? '',
    'Service Type': h.serviceType ?? '',
    'Type': h.emailType ?? '',
    'Sub-Total': h.subTotal != null ? Number(h.subTotal) : '',
    'GST': h.gstAmount != null ? Number(h.gstAmount) : '',
    'Total': h.totalAmount != null ? Number(h.totalAmount) : '',
    'ATO Code': h.atoCode ?? '',
    'Status': h.status ?? '',
    'PDF URL': h.pdfBlobUrl ?? '',
    'Email Date': h.sourceEmailDate?.toISOString?.().slice(0, 10) ?? '',
    'Description': h.description ?? '',
  })))
  XLSX.utils.book_append_sheet(wb, hubSheet, 'Hub Invoices')

  // Sheet 3: Comparison summary
  const suppliers = [...new Set([...oldInvoices.map(i => i.supplier), ...hubRows.map(h => h.supplierName ?? 'Unknown')])]
  const summaryRows = suppliers.map(s => {
    const oldCount = oldInvoices.filter(i => i.supplier === s).length
    const oldTotal = oldInvoices.filter(i => i.supplier === s).reduce((sum, i) => sum + (typeof i.totalAmount === 'number' ? i.totalAmount : 0), 0)
    const hubCount = hubRows.filter(h => h.supplierName === s).length
    const hubTotal = hubRows.filter(h => h.supplierName === s).reduce((sum, h) => sum + (h.totalAmount ? Number(h.totalAmount) : 0), 0)
    const hubWithAmount = hubRows.filter(h => h.supplierName === s && h.totalAmount != null).length
    const hubWithPdf = hubRows.filter(h => h.supplierName === s && h.pdfBlobUrl != null).length
    return {
      'Supplier': s,
      'Old Count': oldCount,
      'Old Total $': oldTotal,
      'Hub Count': hubCount,
      'Hub With $': hubWithAmount,
      'Hub Total $': hubTotal,
      'Hub With PDF': hubWithPdf,
      'Delta Count': hubCount - oldCount,
      'Delta $': hubTotal - oldTotal,
    }
  })
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows)
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Comparison Summary')

  // Write
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  XLSX.writeFile(wb, OUTPUT_FILE)
  console.log(`\nWritten to: ${OUTPUT_FILE}`)
  console.log('\nSheets:')
  console.log('  1. Old App Invoices — all invoices from standalone app output')
  console.log('  2. Hub Invoices — all invoices from hub DB')
  console.log('  3. Comparison Summary — side-by-side counts + totals per supplier')

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
