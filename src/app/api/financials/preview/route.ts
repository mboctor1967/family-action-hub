import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { accounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { downloadPDFContent } from '@/lib/gdrive/client'
import { extractTextFromPDF } from '@/lib/financials/pdf-extract'
import { parseCSV } from '@/lib/financials/csv-parse'
import { parseQFX } from '@/lib/financials/qfx-parse'
import { parseFilenameMetadata, parseTextMetadata } from '@/lib/financials/preview'
import pLimit from 'p-limit'
import type { DriveFile } from '@/types/financials'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if ((session.user as any).role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { files } = body as { files: DriveFile[] }

  if (!files?.length) {
    return new Response(JSON.stringify({ error: 'No files to preview' }), { status: 400 })
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

  const limit = pLimit(5) // 5 concurrent downloads
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: any) {
        controller.enqueue(encoder.encode(`event: preview\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const tasks = files.map((file, index) =>
          limit(async () => {
            const filenameMeta = parseFilenameMetadata(file.name)

            try {
              const { buffer } = await downloadPDFContent(token, file.id)
              const fileType = file.fileType || (file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'pdf')

              if (fileType === 'csv') {
                // CSV: parse directly to get metadata
                const csvContent = buffer.toString('utf-8')
                const csvResult = parseCSV(csvContent, file.name)

                send({
                  index,
                  file_id: file.id,
                  file_name: file.name,
                  file_type: 'csv',
                  size: file.size,
                  page_count: 0,
                  status: csvResult.success ? 'readable' : 'error',
                  bank: csvResult.data?.bank_name || filenameMeta.bank,
                  account_hint: csvResult.data?.account_number_last4 || filenameMeta.accountHint,
                  bsb: csvResult.data?.bsb || null,
                  period: csvResult.data ? `${csvResult.data.statement_start} to ${csvResult.data.statement_end}` : filenameMeta.period,
                  text_length: csvContent.length,
                  transaction_count: csvResult.data?.transactions?.length || 0,
                  format: csvResult.format || null,
                  error: csvResult.success ? undefined : csvResult.error,
                })
              } else if (fileType === 'qfx') {
                // QFX/OFX: parse directly
                const qfxContent = buffer.toString('utf-8')
                const qfxResult = parseQFX(qfxContent, file.name)

                send({
                  index,
                  file_id: file.id,
                  file_name: file.name,
                  file_type: 'qfx',
                  size: file.size,
                  page_count: 0,
                  status: qfxResult.success ? 'readable' : 'error',
                  bank: qfxResult.data?.bank_name || filenameMeta.bank,
                  account_hint: qfxResult.data?.account_number_last4 || filenameMeta.accountHint,
                  bsb: qfxResult.data?.bsb,
                  period: qfxResult.data ? `${qfxResult.data.statement_start} to ${qfxResult.data.statement_end}` : filenameMeta.period,
                  text_length: qfxContent.length,
                  transaction_count: qfxResult.data?.transactions?.length || 0,
                  format: qfxResult.format || null,
                  error: qfxResult.success ? undefined : qfxResult.error,
                })
              } else {
                // PDF: extract text
                const { text, pageCount, isImagePDF, extractionMethod } = await extractTextFromPDF(buffer)

                let textMeta = { bank: null as string | null, accountNumber: null as string | null, bsb: null as string | null, period: null as string | null }
                if (!isImagePDF && text.length > 0) {
                  textMeta = parseTextMetadata(text)
                }

                let status: 'readable' | 'needs_ocr' | 'error' = 'readable'
                if (isImagePDF && extractionMethod === 'none') status = 'needs_ocr'
                else if (isImagePDF && extractionMethod === 'ocr') status = 'readable'

                send({
                  index,
                  file_id: file.id,
                  file_name: file.name,
                  file_type: 'pdf',
                  size: file.size,
                  page_count: pageCount,
                  status,
                  bank: textMeta.bank || filenameMeta.bank,
                  account_hint: textMeta.accountNumber || filenameMeta.accountHint,
                  bsb: textMeta.bsb,
                  period: textMeta.period || filenameMeta.period,
                  text_length: text.length,
                  extraction_method: extractionMethod,
                  transaction_count: 0,
                  format: null,
                })
              }
            } catch (err: any) {
              console.error(`Preview error for ${file.name}:`, err.message || err)
              send({
                index,
                file_id: file.id,
                file_name: file.name,
                size: file.size,
                page_count: 0,
                status: 'error',
                bank: filenameMeta.bank,
                account_hint: filenameMeta.accountHint,
                bsb: null,
                period: filenameMeta.period,
                text_length: 0,
                error: err.message,
              })
            }
          })
        )

        await Promise.all(tasks)

        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ total: files.length })}\n\n`))
      } catch (err: any) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`))
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
