/**
 * Invoice parsing logic — ported from standalone Invoice Reader.
 *
 * Core extraction functions that turn raw email text + PDF content into
 * structured invoice data (date, amount, GST, invoice number, supplier, etc.).
 *
 * Source: C:\Users\MagedBoctor\Claude\Invoice Reader\script\invoice_extractor.js
 * Ported: 2026-04-06
 *
 * v0.1.3 — Invoice Reader Integration
 */

import type { ExtractedInvoice } from '@/types/financials'

// ── Text utilities ──────────────────────────────────────────────────────────

/** Strip HTML tags to plain text. */
export function htmlToText(html: string): string {
  return (html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Parse a date string in various AU formats into ISO date string.
 * Handles: "27th May 2025", "10 June 2025", "27 Jun 2025", "10/06/2025", "10-06-2025"
 */
export function parseDateStr(str: string | null): string | null {
  if (!str) return null
  // DD/MM/YYYY or DD-MM-YYYY
  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1])
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
  }
  // "27th May 2025", "10 June 2025", "27 Jun 2025"
  m = str.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/)
  if (m) {
    const d = new Date(`${m[2]} ${m[1]} ${m[3]}`)
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
  }
  return null
}

// ── Keyword matching ────────────────────────────────────────────────────────

export interface KeywordMatch {
  matched: boolean
  keyword: string
  field: string // 'subject' | 'body' | 'attachment:filename' | 'attachment:content'
}

/**
 * Check whether any supplier keyword appears in email subject, body,
 * attachment filenames, or attachment PDF text content.
 */
export function findKeywordMatch(
  subject: string,
  bodyText: string,
  attachmentFilenames: string[],
  attachmentTexts: string[],
  keywords: string[]
): KeywordMatch {
  const subjectLc = (subject || '').toLowerCase()
  const bodyLc = (bodyText || '').toLowerCase()
  const kwLc = keywords.map(k => k.toLowerCase())

  for (const kw of kwLc) {
    if (subjectLc.includes(kw)) return { matched: true, keyword: kw, field: 'subject' }
  }
  for (const kw of kwLc) {
    if (bodyLc.includes(kw)) return { matched: true, keyword: kw, field: 'body' }
  }
  for (const fname of attachmentFilenames) {
    const fnameLc = (fname || '').toLowerCase()
    for (const kw of kwLc) {
      if (fnameLc.includes(kw)) return { matched: true, keyword: kw, field: 'attachment:filename' }
    }
  }
  for (const text of attachmentTexts) {
    const textLc = (text || '').toLowerCase()
    for (const kw of kwLc) {
      if (textLc.includes(kw)) return { matched: true, keyword: kw, field: 'attachment:content' }
    }
  }

  return { matched: false, keyword: '', field: '' }
}

/**
 * Determine if this is a transactional email (not marketing).
 */
export function isTransactionalEmail(subject: string, textContent: string): boolean {
  const s = (subject || '').toLowerCase()
  const t = (textContent || '').toLowerCase()
  const markers = [
    'invoice', 'tax invoice', 'receipt', 'payment confirmation',
    'reference number', 'order confirmation', 'billing statement',
    'amount due', 'amount payable', 'your booking', 'booking confirmation',
    'invoice number', 'invoice date', 'daily pass bundle',
  ]
  return markers.some(m => s.includes(m) || t.includes(m))
}

// ── Invoice field extraction ────────────────────────────────────────────────

/**
 * Extract structured invoice data from email subject + text content.
 *
 * Despite originating as "extractWilsonData", the regexes are generic
 * and handle multiple supplier formats (Wilson Parking, Good Guys,
 * Evernote, OfficeWorks, etc.).
 */
export function extractInvoiceFields(
  subject: string,
  textContent: string
): ExtractedInvoice {
  const t = textContent || ''
  const s = subject || ''

  let invoiceNumber: string | null = null
  let referenceNumber: string | null = null
  let purchaseDate: string | null = null
  let serviceDate: string | null = null
  let location: string | null = null
  let serviceType: string | null = null
  let totalAmount: number | null = null
  let gstAmount: number | null = null
  let subTotal: number | null = null
  let emailType: ExtractedInvoice['emailType'] = 'Other'

  // ── Invoice number from subject (e.g. "Your Daily Pass Bundle Invoice (PK0169502)")
  const subjInvMatch = s.match(/\(([A-Z0-9]{6,})\)/)
  if (subjInvMatch) invoiceNumber = subjInvMatch[1]

  // ── Reference number
  const refMatch = t.match(/Reference\s+number\s+([\d\-]+)/i)
  if (refMatch) referenceNumber = refMatch[1].trim()

  // ── Invoice number in body — generic patterns
  if (!invoiceNumber) {
    const invMatch =
      t.match(/Invoice\s+(?:number|no\.?|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-_/]{3,30})/i) ||
      t.match(/(?:Order|Reference|Document|Bill)\s*(?:No\.?|Number|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-_/]{3,30})/i)
    if (invMatch) invoiceNumber = invMatch[1].trim()
  }

  // ── Location
  const locMatch =
    t.match(/Prepaid Parking details:\s*([^\n]+?)(?:\s+(?:Flexi Saver|Daily Pass|Monthly|Casual))/i) ||
    t.match(/Car park[:\-]\s*([^\n$]{5,60})/i) ||
    t.match(/parking at\s+([^\n$]{5,60})/i) ||
    t.match(/Location[:\-]\s*([^\n$]{5,60})/i) ||
    t.match(/Mobile service\s+([\d\s]{8,15})/i)
  if (locMatch) location = locMatch[1].trim().replace(/\s+/g, ' ')

  // ── Service/parking type
  const typeMatch =
    t.match(/(Flexi Saver|Daily Pass Bundle|Monthly Parking|Casual|Early Bird)/i) ||
    t.match(/((?:The\s+)?Good Guys Mobile[^\n\r]{0,60})/i)
  if (typeMatch) {
    serviceType = typeMatch[1].trim()
  }

  // ── Service date
  const pDateMatch =
    t.match(/([A-Za-z]{3}\s+\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i) ||
    t.match(/(\d{1,2}\s+[A-Za-z]+\s+-\s+\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)
  if (pDateMatch) serviceDate = pDateMatch[1].trim()

  // ── Purchase/invoice date
  const purchMatch =
    t.match(/Purchased\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i) ||
    t.match(/Invoice\s+date[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i) ||
    t.match(/Invoice\s+date[:\-]?\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i) ||
    t.match(/Issued\s+on\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)
  if (purchMatch) purchaseDate = parseDateStr(purchMatch[1].trim())

  // ── Total amount — multiple patterns
  const totalMatch1 = t.match(/\bTotal,?\s+including\s+GST\s*\$?\s*([\d,]+\.\d{2})/i)
  const totalMatch2 = t.match(/(?:Grand\s+)?\bTotal\b(?:\s+[Aa]mount)?(?:,?\s+including\s+GST)?\s*[:\-]?\s*(?:[A-Z]{2,3}\s+)?\$?\s*([\d,]+\.\d{2})/i)
  const totalMatch3 = t.match(/Amount\s*(?:due|paid|charged|payable)?\s*[:\-]?\s*(?:[A-Z]{2,3}\s+)?\$?\s*([\d,]+\.\d{2})/i)
  const totalMatch4 = t.match(/(?:Total|Amount)\s+[A-Z]{2,3}\s+([\d,]+\.\d{2})/i)
  const rawTotal = (totalMatch1 || totalMatch2 || totalMatch3 || totalMatch4)?.[1]
  if (rawTotal) totalAmount = parseFloat(rawTotal.replace(/,/g, ''))

  // ── GST
  const gstMatch =
    t.match(/GST\s*[:\-]?\s*\$([\d,]+\.\d{2})/i) ||
    t.match(/Incl\.\s*\$([\d,]+\.\d{2})\s*GST/i)
  if (gstMatch) gstAmount = parseFloat(gstMatch[1].replace(/,/g, ''))

  // ── Sub-total
  const subMatch = t.match(/Sub[- ]?total\s*[:\-]?\s*\$([\d,]+\.\d{2})/i)
  if (subMatch) subTotal = parseFloat(subMatch[1].replace(/,/g, ''))

  // ── Email type classification
  const sl = s.toLowerCase()
  const tl = t.toLowerCase()
  if (sl.includes('invoice') || sl.includes('daily pass bundle') || tl.includes('tax invoice') || tl.includes('invoice number') || tl.includes('invoice date'))
    emailType = 'Invoice'
  else if (sl.includes('receipt') || tl.includes('receipt number') || tl.includes('your receipt'))
    emailType = 'Receipt'
  else if (sl.includes('payment confirmation') || tl.includes('payment confirmation'))
    emailType = 'Payment Confirmation'
  else
    emailType = 'Other'

  return {
    invoiceNumber,
    invoiceDate: purchaseDate, // alias — the "invoice date" is the purchase/issue date
    purchaseDate,
    serviceDate,
    referenceNumber,
    supplierName: null, // set by the scan orchestrator from the supplier config
    location,
    serviceType,
    description: s, // email subject
    emailType,
    subTotal,
    gstAmount,
    totalAmount,
    rawText: t,
  }
}
