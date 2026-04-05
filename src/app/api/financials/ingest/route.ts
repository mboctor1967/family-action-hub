import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  accounts,
  financialAccounts,
  financialEntities,
  financialStatements,
  financialSubcategories,
  financialTransactions,
  parseErrors,
} from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { downloadPDFContent } from '@/lib/gdrive/client'
import { extractTextFromPDF } from '@/lib/financials/pdf-extract'
import { parseStatementWithAI } from '@/lib/financials/ai-parse'
import { parseCSV } from '@/lib/financials/csv-parse'
import { parseQFX } from '@/lib/financials/qfx-parse'
import { getModelConfig } from '@/lib/financials/constants'
import { proposeAtoCodes, type EntityType } from '@/lib/financials/ato-proposer'
import pLimit from 'p-limit'
import type { IngestProgressEvent } from '@/types/financials'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if ((session.user as any).role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { file_ids, file_names, file_types } = body as {
    file_ids: string[]
    file_names: Record<string, string>
    file_types?: Record<string, string>
  }

  if (!file_ids?.length) {
    return new Response(JSON.stringify({ error: 'No files to process' }), { status: 400 })
  }

  // Get Google OAuth tokens
  const googleAccount = await db.select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, session.user.id),
      eq(accounts.provider, 'google')
    ))
    .limit(1)

  if (!googleAccount[0]?.access_token) {
    return new Response(JSON.stringify({ error: 'No Google OAuth tokens found' }), { status: 400 })
  }

  const token = {
    accessToken: googleAccount[0].access_token,
    refreshToken: googleAccount[0].refresh_token,
    tokenExpiry: googleAccount[0].expires_at
      ? new Date(googleAccount[0].expires_at * 1000)
      : null,
  }

  const { modelKey, costPerStatement } = getModelConfig()
  const limit = pLimit(3) // Max 3 concurrent AI calls

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: IngestProgressEvent) {
        controller.enqueue(encoder.encode(`event: progress\ndata: ${JSON.stringify(data)}\n\n`))
      }

      let totalCost = 0
      let successCount = 0
      let errorCount = 0
      let reviewCount = 0

      try {
        const tasks = file_ids.map((fileId, index) =>
          limit(async () => {
            const fileName = file_names?.[fileId] || `file_${index + 1}.pdf`

            send({
              type: 'progress',
              current: index + 1,
              total: file_ids.length,
              file_name: fileName,
              status: 'parsing',
              model_used: modelKey,
              estimated_cost: totalCost,
            })

            try {
              // 1. Download file from Drive
              const { buffer } = await downloadPDFContent(token, fileId)
              const lowerName = fileName.toLowerCase()
              const fileType = file_types?.[fileId] || (lowerName.endsWith('.csv') ? 'csv' : lowerName.endsWith('.qfx') || lowerName.endsWith('.ofx') ? 'qfx' : 'pdf')
              let parsed: any
              let sourceType: string = 'pdf_text'

              if (fileType === 'qfx') {
                // QFX/OFX: parse directly — no AI cost
                const qfxContent = buffer.toString('utf-8')
                const qfxResult = parseQFX(qfxContent, fileName)

                if (!qfxResult.success || !qfxResult.data) {
                  await db.insert(parseErrors).values({
                    fileName,
                    gdriveFileId: fileId,
                    errorMessage: qfxResult.error || 'QFX parse failed',
                    errorType: 'parse_failure',
                  })
                  errorCount++
                  send({
                    type: 'progress',
                    current: index + 1,
                    total: file_ids.length,
                    file_name: fileName,
                    status: 'error',
                    error_message: qfxResult.error,
                    estimated_cost: totalCost,
                  })
                  return
                }

                parsed = qfxResult.data
                sourceType = 'qfx'
              } else if (fileType === 'csv') {
                // CSV: parse directly — no AI cost
                const csvContent = buffer.toString('utf-8')
                const csvResult = parseCSV(csvContent, fileName)

                if (!csvResult.success || !csvResult.data) {
                  await db.insert(parseErrors).values({
                    fileName,
                    gdriveFileId: fileId,
                    errorMessage: csvResult.error || 'CSV parse failed',
                    errorType: 'parse_failure',
                  })
                  errorCount++
                  send({
                    type: 'progress',
                    current: index + 1,
                    total: file_ids.length,
                    file_name: fileName,
                    status: 'error',
                    error_message: csvResult.error,
                    estimated_cost: totalCost,
                  })
                  return
                }

                parsed = csvResult.data
                sourceType = 'csv'
              } else {
                // PDF: extract text, then AI parse
                const { text, isImagePDF, extractionMethod } = await extractTextFromPDF(buffer, { enableOCR: true })

                if (isImagePDF && extractionMethod === 'none') {
                  await db.insert(parseErrors).values({
                    fileName,
                    gdriveFileId: fileId,
                    errorMessage: 'No text could be extracted (image PDF). OCR could not read this document.',
                    errorType: 'image_pdf',
                  })

                  await db.insert(financialStatements).values({
                    gdriveFileId: fileId,
                    fileName,
                    fileHash: null,
                    needsReview: true,
                    sourceType: 'pdf_ocr',
                  }).onConflictDoNothing()

                  reviewCount++
                  send({
                    type: 'progress',
                    current: index + 1,
                    total: file_ids.length,
                    file_name: fileName,
                    status: 'needs_review',
                    estimated_cost: totalCost,
                  })
                  return
                }

                sourceType = extractionMethod === 'ocr' ? 'pdf_ocr' : 'pdf_text'

                const result = await parseStatementWithAI(text, fileName)
                totalCost += result.estimatedCost

                if (!result.success || !result.data) {
                  await db.insert(parseErrors).values({
                    fileName,
                    gdriveFileId: fileId,
                    errorMessage: result.error || 'Unknown parse error',
                    errorType: 'ai_error',
                  })
                  errorCount++
                  send({
                    type: 'progress',
                    current: index + 1,
                    total: file_ids.length,
                    file_name: fileName,
                    status: 'error',
                    error_message: result.error,
                    model_used: result.modelUsed,
                    estimated_cost: totalCost,
                  })
                  return
                }

                parsed = result.data
              }

              // 4. Upsert financial account
              const acctLast4 = parsed.account_number_last4 || ''
              let accountId: string

              // Try to find existing account
              const existingAccount = await db.select({ id: financialAccounts.id })
                .from(financialAccounts)
                .where(and(
                  eq(financialAccounts.bankName, parsed.bank_name),
                  eq(financialAccounts.accountNumberLast4, acctLast4)
                ))
                .limit(1)

              if (existingAccount[0]) {
                accountId = existingAccount[0].id
                if (parsed.account_name) {
                  await db.update(financialAccounts).set({
                    accountName: parsed.account_name,
                    bsb: parsed.bsb || undefined,
                    accountType: parsed.account_type || undefined,
                  }).where(eq(financialAccounts.id, accountId))
                }
              } else {
                // Insert with ON CONFLICT DO NOTHING, then re-select
                await db.insert(financialAccounts).values({
                  bankName: parsed.bank_name,
                  accountName: parsed.account_name || '',
                  accountNumberLast4: acctLast4,
                  bsb: parsed.bsb,
                  accountType: parsed.account_type,
                }).onConflictDoNothing()

                const inserted = await db.select({ id: financialAccounts.id })
                  .from(financialAccounts)
                  .where(and(
                    eq(financialAccounts.bankName, parsed.bank_name),
                    eq(financialAccounts.accountNumberLast4, acctLast4)
                  ))
                  .limit(1)
                accountId = inserted[0].id
              }

              // 5. Insert statement
              const [statement] = await db.insert(financialStatements).values({
                accountId,
                fileName,
                gdriveFileId: fileId,
                fileHash: null,
                bankName: parsed.bank_name,
                statementStart: parsed.statement_start,
                statementEnd: parsed.statement_end,
                openingBalance: String(parsed.opening_balance),
                closingBalance: String(parsed.closing_balance),
                sourceType,
                needsReview: false,
              }).onConflictDoNothing().returning()

              if (!statement) {
                // Content-level duplicate (same account + period)
                send({
                  type: 'progress',
                  current: index + 1,
                  total: file_ids.length,
                  file_name: fileName,
                  status: 'duplicate',
                  model_used: sourceType,
                  estimated_cost: totalCost,
                })
                return
              }

              // 6. Bulk insert transactions
              if (parsed.transactions?.length) {
                // Phase F1 — fetch entity type + subcategory defaults for ATO proposal
                const [entityRow] = await db
                  .select({ type: financialEntities.type })
                  .from(financialAccounts)
                  .leftJoin(financialEntities, eq(financialAccounts.entityId, financialEntities.id))
                  .where(eq(financialAccounts.id, accountId))
                  .limit(1)
                const entityType: EntityType = (entityRow?.type ?? null) as EntityType
                const subcatsForIngest = await db.select().from(financialSubcategories)
                const subcatByName = new Map(subcatsForIngest.map(s => [s.name, s]))

                const txnValues = parsed.transactions.map((txn: any, rowIdx: number) => {
                  // Phase F1 — propose ATO codes at ingest time
                  const subcat = txn.subcategory ? subcatByName.get(txn.subcategory) : null
                  const atoProposal = proposeAtoCodes(
                    {
                      merchantName: txn.merchant_name,
                      descriptionRaw: txn.description_raw,
                      amount: txn.amount,
                      category: txn.category,
                    },
                    subcat
                      ? { name: subcat.name, atoCodePersonal: subcat.atoCodePersonal, atoCodeCompany: subcat.atoCodeCompany }
                      : null,
                    entityType
                  )

                  return {
                    statementId: statement.id,
                    accountId,
                    transactionDate: txn.transaction_date,
                    descriptionRaw: txn.description_raw,
                    merchantName: txn.merchant_name,
                    amount: String(txn.amount),
                    isDebit: txn.is_debit,
                    runningBalance: txn.running_balance != null ? String(txn.running_balance) : null,
                    category: txn.category,
                    subcategory: txn.subcategory,
                    isSubscription: txn.is_subscription || false,
                    subscriptionFrequency: txn.subscription_frequency,
                    isTaxDeductible: txn.is_tax_deductible || false,
                    taxCategory: txn.tax_category,
                    needsReview: false,
                    rowIndex: (txn as any).row_index ?? rowIdx,
                    // Phase F1 — AI-suggested ATO codes populated at import time
                    aiSuggestedAtoCodePersonal: atoProposal.aiPersonal,
                    aiSuggestedAtoCodeCompany: atoProposal.aiCompany,
                  }
                })

                // Insert in batches to avoid query size limits
                const batchSize = 50
                for (let i = 0; i < txnValues.length; i += batchSize) {
                  const batch = txnValues.slice(i, i + batchSize)
                  await db.insert(financialTransactions)
                    .values(batch)
                    .onConflictDoNothing()
                }
              }

              successCount++
              send({
                type: 'progress',
                current: index + 1,
                total: file_ids.length,
                file_name: fileName,
                status: 'parsed',
                model_used: sourceType,
                estimated_cost: totalCost,
              })
            } catch (err: any) {
              await db.insert(parseErrors).values({
                fileName,
                gdriveFileId: fileId,
                errorMessage: err.message || 'Unknown error',
                errorType: 'parse_failure',
              })

              errorCount++
              send({
                type: 'progress',
                current: index + 1,
                total: file_ids.length,
                file_name: fileName,
                status: 'error',
                error_message: err.message,
                estimated_cost: totalCost,
              })
            }
          })
        )

        await Promise.all(tasks)

        // Send completion event
        controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify({
          type: 'complete',
          total: file_ids.length,
          success: successCount,
          errors: errorCount,
          needs_review: reviewCount,
          total_cost: Math.round(totalCost * 1000) / 1000,
          model_used: modelKey,
        })}\n\n`))
      } catch (error: any) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({
          type: 'error',
          error: error.message || 'Ingest failed',
        })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
