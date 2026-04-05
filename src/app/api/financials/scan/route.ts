import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { accounts, financialStatements } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { listFiles } from '@/lib/gdrive/client'
import type { ScanResult } from '@/types/financials'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { fileTypes } = body as { fileTypes?: string[] } // e.g. ['pdf', 'csv']

  const folderId = process.env.GDRIVE_FINANCIALS_FOLDER_ID
  if (!folderId) {
    return NextResponse.json({ error: 'GDRIVE_FINANCIALS_FOLDER_ID not configured' }, { status: 500 })
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
    return NextResponse.json(
      { error: 'No Google OAuth tokens found. Please sign out and sign in again to grant Drive access.' },
      { status: 400 }
    )
  }

  const token = {
    accessToken: googleAccount[0].access_token,
    refreshToken: googleAccount[0].refresh_token,
    tokenExpiry: googleAccount[0].expires_at
      ? new Date(googleAccount[0].expires_at * 1000)
      : null,
  }

  // List all PDFs in the Drive folder
  let files
  try {
    const result = await listFiles(token, folderId)
    // Filter by requested file types
    files = fileTypes?.length
      ? result.files.filter((f) => fileTypes.includes(f.fileType))
      : result.files
  } catch (err: any) {
    return NextResponse.json(
      { error: `Google Drive error: ${err.message}. You may need to sign out and sign back in to grant Drive access.` },
      { status: 500 }
    )
  }

  if (files.length === 0) {
    return NextResponse.json({
      total: 0,
      new_files: [],
      duplicates: [],
      already_imported: [],
    } satisfies ScanResult)
  }

  // Check which files are already imported (by gdrive_file_id or file_hash)
  const driveIds = files.map((f) => f.id)
  const hashes = files.map((f) => f.md5Checksum).filter(Boolean)

  const existingByDriveId = await db.select({
    gdriveFileId: financialStatements.gdriveFileId,
    fileHash: financialStatements.fileHash,
  })
    .from(financialStatements)
    .where(inArray(financialStatements.gdriveFileId, driveIds))

  const existingByHash = hashes.length > 0
    ? await db.select({
        gdriveFileId: financialStatements.gdriveFileId,
        fileHash: financialStatements.fileHash,
      })
        .from(financialStatements)
        .where(inArray(financialStatements.fileHash, hashes))
    : []

  const importedDriveIds = new Set(existingByDriveId.map((e) => e.gdriveFileId))
  const importedHashes = new Set(existingByHash.map((e) => e.fileHash))

  const new_files = []
  const duplicates = []
  const already_imported = []

  for (const file of files) {
    if (importedDriveIds.has(file.id)) {
      already_imported.push(file)
    } else if (file.md5Checksum && importedHashes.has(file.md5Checksum)) {
      duplicates.push(file)
    } else {
      new_files.push(file)
    }
  }

  return NextResponse.json({
    total: files.length,
    new_files,
    duplicates,
    already_imported,
  } satisfies ScanResult)
}
