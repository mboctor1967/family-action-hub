/**
 * Drive folder scan for invoice files.
 *
 * Shallow scan (files only, no recursion), MIME-filtered, 500-file cap.
 * Accepts either a bare folder ID or a Drive URL with the ID embedded.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { createDriveClient } from './client'

interface TokenInfo {
  accessToken: string
  refreshToken?: string | null
  tokenExpiry?: Date | null
}

export interface InvoiceDriveFile {
  id: string
  name: string
  mimeType: string
  webViewLink: string
  modifiedTime: string
  sizeBytes: number | null
}

export const ALLOWED_INVOICE_MIME: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
])

const MAX_INVOICE_FILES = 500

/**
 * Extract a Drive folder ID from either a bare ID string or a Drive URL.
 * Supported URL forms:
 *   https://drive.google.com/drive/folders/{ID}
 *   https://drive.google.com/drive/folders/{ID}?usp=share_link
 *   https://drive.google.com/drive/u/0/folders/{ID}
 *   https://drive.google.com/open?id={ID}
 * Or a bare ID: a string that looks like a Drive ID (long alphanumeric with -/_).
 */
export function extractFolderId(input: string | null): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  // Try URL forms first
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (folderMatch) return folderMatch[1]

  const openMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (openMatch) return openMatch[1]

  // Bare ID — Drive IDs are typically 25-44 chars of [A-Za-z0-9_-]
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed

  return null
}

/**
 * Scan a Drive folder for invoice files.
 *
 * @throws Error with code 'FOLDER_NOT_FOUND' | 'FOLDER_INVALID' | 'FOLDER_ACCESS_DENIED'
 */
export async function scanInvoiceFolder(
  token: TokenInfo,
  folderInput: string
): Promise<{ files: InvoiceDriveFile[]; truncated: boolean; newAccessToken?: string }> {
  const folderId = extractFolderId(folderInput)
  if (!folderId) {
    const err = new Error(`Invalid folder input: "${folderInput}"`) as Error & { code: string }
    err.code = 'FOLDER_INVALID'
    throw err
  }

  const { drive, newAccessToken } = await createDriveClient(token)

  // Verify the folder exists + is accessible
  try {
    await drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType',
    })
  } catch (err) {
    const wrapped = new Error(`Folder not found or not accessible: ${folderId}`) as Error & { code: string }
    wrapped.code = 'FOLDER_NOT_FOUND'
    throw wrapped
  }

  // Shallow listing — direct children only
  const files: InvoiceDriveFile[] = []
  let pageToken: string | undefined
  let truncated = false

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime, size)',
      pageSize: 200,
      pageToken,
      orderBy: 'modifiedTime desc',
    })

    for (const file of res.data.files || []) {
      if (files.length >= MAX_INVOICE_FILES) {
        truncated = true
        break
      }
      const mime = file.mimeType || ''
      if (!ALLOWED_INVOICE_MIME.has(mime)) continue
      files.push({
        id: file.id!,
        name: file.name || 'unnamed',
        mimeType: mime,
        webViewLink: file.webViewLink || '',
        modifiedTime: file.modifiedTime || '',
        sizeBytes: file.size ? parseInt(file.size, 10) : null,
      })
    }

    pageToken = res.data.nextPageToken || undefined
  } while (pageToken && !truncated)

  return { files, truncated, newAccessToken }
}

/**
 * Download a Drive file's content as a Buffer (for ZIP bundling).
 */
export async function downloadInvoiceFile(
  token: TokenInfo,
  fileId: string
): Promise<{ buffer: Buffer; newAccessToken?: string }> {
  const { drive, newAccessToken } = await createDriveClient(token)

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )

  return {
    buffer: Buffer.from(res.data as ArrayBuffer),
    newAccessToken,
  }
}
