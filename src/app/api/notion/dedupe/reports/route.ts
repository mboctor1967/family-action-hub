import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notionDedupeReports } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await db
    .select({
      id: notionDedupeReports.id,
      uploadedAt: notionDedupeReports.uploadedAt,
      filename: notionDedupeReports.filename,
      scanTimestamp: notionDedupeReports.scanTimestamp,
      totalClusters: notionDedupeReports.totalClusters,
      totalPages: notionDedupeReports.totalPages,
      decisions: notionDedupeReports.decisions,
    })
    .from(notionDedupeReports)
    .orderBy(desc(notionDedupeReports.uploadedAt))

  const out = rows.map((r) => {
    const dec = (r.decisions ?? {}) as Record<string, { status: string }>
    const archivedCount = Object.values(dec).filter((d) => d.status === 'archived').length
    const { decisions: _omit, ...rest } = r
    return { ...rest, archivedCount }
  })

  return NextResponse.json({ reports: out })
}
