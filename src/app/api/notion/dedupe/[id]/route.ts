import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notionDedupeReports } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const [row] = await db.select().from(notionDedupeReports).where(eq(notionDedupeReports.id, id)).limit(1)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: row.id,
    uploadedAt: row.uploadedAt,
    filename: row.filename,
    scanTimestamp: row.scanTimestamp,
    totalClusters: row.totalClusters,
    totalPages: row.totalPages,
    report: row.report,
    decisions: row.decisions,
  })
}
