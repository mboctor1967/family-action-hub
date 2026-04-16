import { google } from 'googleapis'
import type { DriveFile } from '@/types/financials'
import { SUPPORTED_MIME_TYPES } from '@/types/financials'

interface TokenInfo {
  accessToken: string
  refreshToken?: string | null
  tokenExpiry?: Date | null
}

/**
 * Creates a Google Drive client with automatic token refresh.
 * Returns the client and a potentially refreshed access token.
 */
export async function createDriveClient(token: TokenInfo): Promise<{
  drive: ReturnType<typeof google.drive>
  newAccessToken?: string
}> {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  oauth2.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken || undefined,
  })

  // Check if token is expired or about to expire (within 5 minutes)
  const isExpired = token.tokenExpiry && new Date(token.tokenExpiry).getTime() < Date.now() + 5 * 60 * 1000
  let newAccessToken: string | undefined

  if (isExpired && token.refreshToken) {
    try {
      const { credentials } = await oauth2.refreshAccessToken()
      oauth2.setCredentials(credentials)
      newAccessToken = credentials.access_token || undefined
    } catch (err) {
      console.error('Failed to refresh token:', err)
      throw new Error('Google Drive token expired and refresh failed. Please reconnect your account in Settings.')
    }
  }

  return {
    drive: google.drive({ version: 'v3', auth: oauth2 }),
    newAccessToken,
  }
}

/**
 * Lists all supported files (PDF, CSV) in a Google Drive folder (recursively).
 * Returns file metadata including md5Checksum for dedup.
 */
export async function listFiles(
  token: TokenInfo,
  folderId: string
): Promise<{ files: DriveFile[]; newAccessToken?: string }> {
  const { drive, newAccessToken } = await createDriveClient(token)
  const allFiles: DriveFile[] = []

  async function listFolder(parentId: string) {
    let pageToken: string | undefined

    do {
      const res = await drive.files.list({
        q: `'${parentId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, md5Checksum, size)',
        pageSize: 1000,
        pageToken,
      })

      const files = res.data.files || []

      for (const file of files) {
        const name = file.name || ''
        const lower = name.toLowerCase()
        // Extension wins over mime type — Drive often labels QIF/QFX as text/plain, which
        // would otherwise be misclassified as CSV via SUPPORTED_MIME_TYPES.
        let fileType: DriveFile['fileType'] | undefined
        let mime = file.mimeType || ''
        if (lower.endsWith('.qif')) {
          fileType = 'qif'
          mime = mime || 'application/qif'
        } else if (lower.endsWith('.qfx') || lower.endsWith('.ofx')) {
          fileType = 'qfx'
          mime = mime || 'application/x-ofx'
        } else if (lower.endsWith('.csv')) {
          fileType = 'csv'
          mime = mime || 'text/csv'
        } else if (lower.endsWith('.pdf')) {
          fileType = 'pdf'
          mime = mime || 'application/pdf'
        } else if (SUPPORTED_MIME_TYPES[mime]) {
          fileType = SUPPORTED_MIME_TYPES[mime]
        }

        if (fileType) {
          allFiles.push({
            id: file.id!,
            name,
            mimeType: mime,
            md5Checksum: file.md5Checksum || '',
            size: parseInt(file.size || '0', 10),
            fileType,
          })
          continue
        }

        if (file.mimeType === 'application/vnd.google-apps.folder') {
          await listFolder(file.id!)
        }
      }

      pageToken = res.data.nextPageToken || undefined
    } while (pageToken)
  }

  await listFolder(folderId)
  return { files: allFiles, newAccessToken }
}

/** @deprecated Use listFiles instead */
export const listPDFs = listFiles

/**
 * Downloads a PDF file's content from Google Drive as a Buffer.
 */
export async function downloadPDFContent(
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
