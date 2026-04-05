/**
 * GET /api/financials/tax/invoices?entityId=...&fy=...
 *
 * Scans the entity's configured Drive folder and cross-references with
 * the invoice_tags table. Returns a unified list with tag metadata.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialEntities, invoiceTags } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { scanInvoiceFolder } from '@/lib/gdrive/scan-invoices'
import { getDriveTokenForUser } from '@/lib/gdrive/tokens'
import type { InvoiceFile } from '@/types/financials'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const entityId = url.searchParams.get('entityId')
  const fy = url.searchParams.get('fy')

  if (!entityId || !fy) {
    return NextResponse.json({ error: 'entityId and fy are required' }, { status: 400 })
  }

  // Fetch entity
  const [entity] = await db
    .select()
    .from(financialEntities)
    .where(eq(financialEntities.id, entityId))
    .limit(1)

  if (!entity) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  }

  if (!entity.invoiceDriveFolder) {
    return NextResponse.json({
      files: [],
      unmatched: 0,
      message: 'No Drive folder configured for this entity',
    })
  }

  // Fetch Drive token
  const driveToken = await getDriveTokenForUser(session.user.id)
  if (!driveToken) {
    return NextResponse.json({ error: 'No Google Drive connection' }, { status: 400 })
  }

  // Scan folder
  let scanResult
  try {
    scanResult = await scanInvoiceFolder(driveToken, entity.invoiceDriveFolder)
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err.code === 'FOLDER_NOT_FOUND'
          ? `Drive folder not found: ${entity.invoiceDriveFolder}`
          : err.code === 'FOLDER_INVALID'
          ? `Invalid folder path: ${entity.invoiceDriveFolder}`
          : `Drive scan failed: ${err?.message ?? String(err)}`,
      },
      { status: 400 }
    )
  }

  // Fetch tags for this entity+FY
  const tags = await db
    .select()
    .from(invoiceTags)
    .where(and(eq(invoiceTags.entityId, entityId), eq(invoiceTags.fy, fy)))

  const tagsByFileId = new Map(tags.map(t => [t.gdriveFileId, t]))

  const files: InvoiceFile[] = scanResult.files.map(f => {
    const tag = tagsByFileId.get(f.id)
    return {
      gdriveFileId: f.id,
      filename: f.name,
      driveUrl: f.webViewLink,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      sizeBytes: f.sizeBytes,
      tag: tag
        ? {
            supplier: tag.supplier,
            amount: tag.amount !== null ? Number(tag.amount) : null,
            atoCodePersonal: tag.atoCodePersonal,
            atoCodeCompany: tag.atoCodeCompany,
            linkedTxnId: tag.linkedTxnId,
            matchStatus: (tag.matchStatus ?? 'unmatched') as 'matched' | 'unmatched' | 'verified',
            notes: tag.notes,
          }
        : null,
    }
  })

  const unmatched = files.filter(f => !f.tag || f.tag.matchStatus === 'unmatched').length

  return NextResponse.json({
    files,
    unmatched,
    truncated: scanResult.truncated,
  })
}
