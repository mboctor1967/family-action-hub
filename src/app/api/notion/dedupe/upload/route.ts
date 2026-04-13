import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notionDedupeReports } from '@/lib/db/schema'
import { DedupeReportSchema, type DedupeReport } from '@/lib/notion/dedupe-schema'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const filename = typeof body?.filename === 'string' ? body.filename : 'unknown.json'
  const parsed = DedupeReportSchema.safeParse(body?.report)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid report shape', issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    )
  }

  const report: DedupeReport = parsed.data
  const totalClusters = report.length
  const totalPages = report.reduce((s, c) => s + c.pages.length, 0)
  const scanTimestamp =
    filename.match(/dedupe-([0-9T\-]+)\.json/)?.[1] || new Date().toISOString()

  const [row] = await db
    .insert(notionDedupeReports)
    .values({
      uploadedBy: session.user.email || 'unknown',
      filename,
      scanTimestamp,
      totalClusters,
      totalPages,
      report,
      decisions: {},
    })
    .returning({ id: notionDedupeReports.id })

  return NextResponse.json({ id: row.id })
}
