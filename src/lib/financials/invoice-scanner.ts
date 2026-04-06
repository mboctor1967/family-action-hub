/**
 * Invoice scan orchestrator.
 *
 * Connects: Gmail API search → download emails → parse → extract fields
 * → save invoice rows to Neon DB → upload PDFs to Vercel Blob.
 *
 * v0.1.3 — Invoice Reader Integration
 */

import { db } from '@/lib/db'
import { invoices, invoiceSuppliers } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { put } from '@vercel/blob'
import {
  searchGmailByLabel,
  searchGmailByQuery,
  getEmailContent,
  downloadAttachment,
  type GmailMessage,
} from '@/lib/gmail/search'
import {
  extractInvoiceFields,
  findKeywordMatch,
  isTransactionalEmail,
  htmlToText,
} from '@/lib/financials/invoice-parser'
import { parseFy } from '@/lib/financials/tax-export/queries'
import type { DriveToken } from '@/lib/gdrive/tokens'
import type { ScanProgressEvent } from '@/types/financials'

export interface ScanInput {
  supplierId: string
  token: DriveToken // reuses the same Google OAuth token
}

export interface ScanResult {
  emailsFound: number
  emailsProcessed: number
  invoicesExtracted: number
  duplicatesSkipped: number
  errors: string[]
}

export type ScanOnProgress = (event: ScanProgressEvent) => void | Promise<void>

/**
 * Scan Gmail for invoices from a single supplier and save results to DB.
 */
/**
 * Scan ALL active suppliers for a given FY. Uses query-based search (sender emails + keywords).
 * Skips suppliers with no sender emails (they need manual config first).
 */
export async function scanAllSuppliers(
  fy: string,
  token: DriveToken,
  onProgress: ScanOnProgress = () => {}
): Promise<ScanResult> {
  const fyRange = parseFy(fy)
  const allSuppliers = await db.select().from(invoiceSuppliers).where(eq(invoiceSuppliers.isActive, true))

  // Filter to suppliers that have sender emails (query-based search requires them)
  const scannable = allSuppliers.filter(s => {
    const emails = (s.senderEmails as string[]) || []
    return emails.length > 0
  })

  const skipped = allSuppliers.length - scannable.length

  await onProgress({
    type: 'progress',
    step: `Found ${scannable.length} scannable suppliers (${skipped} skipped — no sender emails)`,
    percent: 2,
  })

  const totalResult: ScanResult = {
    emailsFound: 0,
    emailsProcessed: 0,
    invoicesExtracted: 0,
    duplicatesSkipped: 0,
    errors: [],
  }

  if (scannable.length === 0) {
    await onProgress({ type: 'complete', emailsFound: 0, invoicesExtracted: 0, message: 'No suppliers with sender emails configured' })
    return totalResult
  }

  for (let i = 0; i < scannable.length; i++) {
    const supplier = scannable[i]
    const basePct = 5 + Math.round((90 * i) / scannable.length)

    await onProgress({
      type: 'progress',
      step: `Scanning ${supplier.name} (${i + 1}/${scannable.length})`,
      percent: basePct,
    })

    try {
      // Override the supplier's FY with the user-selected FY
      const senderEmails = (supplier.senderEmails as string[]) || []
      const keywords = (supplier.keywords as string[]) || []

      const { messageIds } = await searchGmailByQuery(token, {
        senderEmails,
        keywords: keywords.length > 0 ? keywords : undefined,
        startDate: new Date(fyRange.startDate),
        endDate: new Date(fyRange.endDate),
      }, 500)

      totalResult.emailsFound += messageIds.length

      await onProgress({
        type: 'progress',
        step: `${supplier.name}: ${messageIds.length} emails found`,
        percent: basePct + Math.round(10 / scannable.length),
      })

      // Process each email (same logic as single-supplier scan)
      for (let j = 0; j < messageIds.length; j++) {
        const msgId = messageIds[j]
        try {
          // Dedup
          const existing = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.sourceEmailId, msgId)).limit(1)
          if (existing.length > 0) { totalResult.duplicatesSkipped++; continue }

          const email = await getEmailContent(token, msgId)
          let textContent = email.htmlBody ? htmlToText(email.htmlBody) : email.textBody

          const attachmentFilenames: string[] = []
          const attachmentTexts: string[] = []
          let pdfBuffer: Buffer | null = null

          for (const att of email.attachments) {
            attachmentFilenames.push(att.filename)
            if (att.mimeType === 'application/pdf') {
              try {
                const buf = await downloadAttachment(token, msgId, att.attachmentId)
                const pdfParse = (await import('pdf-parse')).default
                const pdfData = await pdfParse(buf)
                if (pdfData.text) { attachmentTexts.push(pdfData.text); textContent += '\n' + pdfData.text }
                if (!pdfBuffer) pdfBuffer = buf
              } catch {}
            }
          }

          // Keyword match (still useful to filter noise even with sender-based search)
          if (keywords.length > 0) {
            const kwMatch = findKeywordMatch(email.subject, textContent, attachmentFilenames, attachmentTexts, keywords)
            if (!kwMatch.matched) { totalResult.emailsProcessed++; continue }
          }

          if (!isTransactionalEmail(email.subject, textContent)) { totalResult.emailsProcessed++; continue }

          const extracted = extractInvoiceFields(email.subject, textContent)
          if (!['Invoice', 'Receipt'].includes(extracted.emailType)) {
            extracted.emailType = 'Invoice' // default for sender-matched emails
          }

          // Upload PDF
          let pdfBlobUrl: string | null = null
          if (pdfBuffer) {
            try {
              const safeName = `${email.date?.toISOString().split('T')[0] ?? 'unknown'}_${supplier.name.replace(/[^a-zA-Z0-9]/g, '_')}_${extracted.invoiceNumber ?? j}.pdf`
              const blob = await put(`invoices/${fy}/${safeName}`, pdfBuffer, { access: 'public', contentType: 'application/pdf', addRandomSuffix: true })
              pdfBlobUrl = blob.url
            } catch {}
          }

          // Save to DB
          await db.insert(invoices).values({
            supplierId: supplier.id,
            entityId: supplier.entityId,
            fy,
            invoiceNumber: extracted.invoiceNumber,
            invoiceDate: extracted.invoiceDate,
            purchaseDate: extracted.purchaseDate,
            serviceDate: extracted.serviceDate,
            referenceNumber: extracted.referenceNumber,
            supplierName: supplier.name,
            location: extracted.location,
            serviceType: extracted.serviceType,
            description: extracted.description,
            emailType: extracted.emailType,
            subTotal: extracted.subTotal !== null ? String(extracted.subTotal) : null,
            gstAmount: extracted.gstAmount !== null ? String(extracted.gstAmount) : null,
            totalAmount: extracted.totalAmount !== null ? String(extracted.totalAmount) : null,
            pdfBlobUrl,
            sourceEmailId: msgId,
            sourceEmailDate: email.date,
            sourceFrom: email.from,
            atoCode: supplier.defaultAtoCode,
            status: 'extracted',
            rawText: textContent.slice(0, 50000),
          })

          totalResult.invoicesExtracted++
        } catch (err: any) {
          totalResult.errors.push(`${supplier.name} email ${j + 1}: ${err?.message ?? String(err)}`)
        }
        totalResult.emailsProcessed++
      }

      // Update lastScannedAt
      await db.update(invoiceSuppliers).set({ lastScannedAt: new Date() }).where(eq(invoiceSuppliers.id, supplier.id))
    } catch (err: any) {
      totalResult.errors.push(`${supplier.name}: ${err?.message ?? String(err)}`)
    }
  }

  await onProgress({
    type: 'complete',
    emailsFound: totalResult.emailsFound,
    invoicesExtracted: totalResult.invoicesExtracted,
    message: `Done: ${totalResult.invoicesExtracted} invoices from ${totalResult.emailsFound} emails across ${scannable.length} suppliers (${totalResult.duplicatesSkipped} dupes skipped${skipped > 0 ? `, ${skipped} suppliers without sender emails skipped` : ''})`,
  })

  return totalResult
}

/**
 * Scan a single supplier (original function).
 */
export async function scanSupplierInvoices(
  input: ScanInput,
  onProgress: ScanOnProgress = () => {}
): Promise<ScanResult> {
  // Load supplier config
  const [supplier] = await db
    .select()
    .from(invoiceSuppliers)
    .where(eq(invoiceSuppliers.id, input.supplierId))
    .limit(1)

  if (!supplier) throw new Error(`Supplier ${input.supplierId} not found`)

  const fy = parseFy(supplier.fy)
  const keywords = (supplier.keywords as string[]) || []
  const senderEmails = (supplier.senderEmails as string[]) || []

  // Must have either a Gmail label OR sender emails to search
  if (!supplier.gmailLabel && senderEmails.length === 0) {
    throw new Error(`Supplier "${supplier.name}" needs either a Gmail label or sender email addresses to scan`)
  }

  // Date range: custom overrides FY-derived dates
  const startDate = supplier.customStartDate ? new Date(supplier.customStartDate) : new Date(fy.startDate)
  const endDate = supplier.customEndDate ? new Date(supplier.customEndDate) : new Date(fy.endDate)

  // Search Gmail — prefer query-based (sender + keywords), fall back to label-based
  let messageIds: string[]
  if (senderEmails.length > 0) {
    await onProgress({
      type: 'progress',
      step: `Searching Gmail: from ${senderEmails[0]}${senderEmails.length > 1 ? ` +${senderEmails.length - 1} more` : ''} + ${keywords.length} keywords`,
      percent: 5,
    })
    const result = await searchGmailByQuery(input.token, {
      senderEmails,
      keywords: keywords.length > 0 ? keywords : undefined,
      startDate,
      endDate,
    }, 500)
    messageIds = result.messageIds
  } else {
    await onProgress({ type: 'progress', step: `Searching Gmail label "${supplier.gmailLabel}"`, percent: 5 })
    const result = await searchGmailByLabel(input.token, supplier.gmailLabel!, startDate, endDate, 500)
    messageIds = result.messageIds
  }

  await onProgress({
    type: 'progress',
    step: `Found ${messageIds.length} emails`,
    percent: 10,
    emailsFound: messageIds.length,
  })

  const result: ScanResult = {
    emailsFound: messageIds.length,
    emailsProcessed: 0,
    invoicesExtracted: 0,
    duplicatesSkipped: 0,
    errors: [],
  }

  if (messageIds.length === 0) {
    await onProgress({ type: 'complete', emailsFound: 0, invoicesExtracted: 0 })
    return result
  }

  // Process each email
  for (let i = 0; i < messageIds.length; i++) {
    const msgId = messageIds[i]
    const pct = 10 + Math.round((80 * (i + 1)) / messageIds.length)

    try {
      // Check if already processed (dedup by source_email_id)
      const existing = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.sourceEmailId, msgId))
        .limit(1)

      if (existing.length > 0) {
        result.duplicatesSkipped++
        continue
      }

      // Fetch email content
      const email = await getEmailContent(input.token, msgId)

      // Get text content
      let textContent = email.htmlBody ? htmlToText(email.htmlBody) : email.textBody

      // Also extract text from PDF attachments
      const attachmentFilenames: string[] = []
      const attachmentTexts: string[] = []

      for (const att of email.attachments) {
        attachmentFilenames.push(att.filename)
        if (att.mimeType === 'application/pdf') {
          try {
            const pdfBuffer = await downloadAttachment(input.token, msgId, att.attachmentId)
            const pdfParse = (await import('pdf-parse')).default
            const pdfData = await pdfParse(pdfBuffer)
            if (pdfData.text) {
              attachmentTexts.push(pdfData.text)
              textContent += '\n' + pdfData.text
            }
            att.data = pdfBuffer // cache for later PDF storage
          } catch {
            // PDF parsing failure — continue without this attachment's text
          }
        }
      }

      // Keyword match
      const kwMatch = findKeywordMatch(
        email.subject,
        textContent,
        attachmentFilenames,
        attachmentTexts,
        keywords
      )

      if (!kwMatch.matched) {
        result.emailsProcessed++
        continue
      }

      // Transactional filter (skip marketing unless keyword confirmed)
      if (!isTransactionalEmail(email.subject, textContent)) {
        result.emailsProcessed++
        continue
      }

      // Extract invoice fields
      const extracted = extractInvoiceFields(email.subject, textContent)

      // Only keep Invoice and Receipt types
      if (!['Invoice', 'Receipt'].includes(extracted.emailType)) {
        // If keyword was confirmed but type unknown, default to Invoice
        if (kwMatch.matched) {
          extracted.emailType = 'Invoice'
        } else {
          result.emailsProcessed++
          continue
        }
      }

      // Upload PDF to Vercel Blob (prefer attached PDF, fall back to none)
      let pdfBlobUrl: string | null = null
      const pdfAttachment = email.attachments.find(
        a => a.mimeType === 'application/pdf' && a.data
      )
      if (pdfAttachment?.data) {
        try {
          const safeFilename = `${email.date?.toISOString().split('T')[0] ?? 'unknown'}_${supplier.name.replace(/[^a-zA-Z0-9]/g, '_')}_${extracted.invoiceNumber ?? i}.pdf`
          const blob = await put(
            `invoices/${supplier.fy}/${safeFilename}`,
            pdfAttachment.data,
            { access: 'public', contentType: 'application/pdf', addRandomSuffix: true }
          )
          pdfBlobUrl = blob.url
        } catch (err: any) {
          result.errors.push(`PDF upload failed for email ${i + 1}: ${err?.message}`)
        }
      }

      // Save to DB
      await db.insert(invoices).values({
        supplierId: supplier.id,
        entityId: supplier.entityId,
        fy: supplier.fy,
        invoiceNumber: extracted.invoiceNumber,
        invoiceDate: extracted.invoiceDate,
        purchaseDate: extracted.purchaseDate,
        serviceDate: extracted.serviceDate,
        referenceNumber: extracted.referenceNumber,
        supplierName: supplier.name,
        location: extracted.location,
        serviceType: extracted.serviceType,
        description: extracted.description,
        emailType: extracted.emailType,
        subTotal: extracted.subTotal !== null ? String(extracted.subTotal) : null,
        gstAmount: extracted.gstAmount !== null ? String(extracted.gstAmount) : null,
        totalAmount: extracted.totalAmount !== null ? String(extracted.totalAmount) : null,
        pdfBlobUrl,
        sourceEmailId: msgId,
        sourceEmailDate: email.date,
        sourceFrom: email.from,
        atoCode: supplier.defaultAtoCode,
        status: 'extracted',
        rawText: textContent.slice(0, 50000), // cap at 50KB
      })

      result.invoicesExtracted++

      await onProgress({
        type: 'progress',
        step: `Extracted: ${extracted.emailType} — ${extracted.invoiceNumber ?? email.subject.slice(0, 40)}`,
        percent: pct,
        invoicesExtracted: result.invoicesExtracted,
      })
    } catch (err: any) {
      result.errors.push(`Email ${i + 1} (${msgId}): ${err?.message ?? String(err)}`)
    }

    result.emailsProcessed++
  }

  // Update supplier lastScannedAt
  await db
    .update(invoiceSuppliers)
    .set({ lastScannedAt: new Date(), updatedAt: new Date() })
    .where(eq(invoiceSuppliers.id, supplier.id))

  await onProgress({
    type: 'complete',
    emailsFound: result.emailsFound,
    invoicesExtracted: result.invoicesExtracted,
  })

  return result
}
