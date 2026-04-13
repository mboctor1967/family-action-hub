import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notionDedupeReports } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { archiveBatch } from '@/lib/notion/archive'
import { DecisionsSchema, DedupeReportSchema, pickKeepId } from '@/lib/notion/dedupe-schema'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const token = process.env.NOTION_DEDUPE_TOKEN
  if (!token) return NextResponse.json({ error: 'NOTION_DEDUPE_TOKEN not set' }, { status: 500 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const pageIds: unknown = body?.pageIds
  if (!Array.isArray(pageIds) || !pageIds.every((x) => typeof x === 'string')) {
    return NextResponse.json({ error: 'pageIds must be string[]' }, { status: 400 })
  }
  if (pageIds.length === 0) return NextResponse.json({ error: 'pageIds empty' }, { status: 400 })
  if (pageIds.length > 100) return NextResponse.json({ error: 'Max 100 pages per request' }, { status: 400 })

  const [row] = await db.select().from(notionDedupeReports).where(eq(notionDedupeReports.id, id)).limit(1)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const report = DedupeReportSchema.parse(row.report)
  const keepIds = new Set(report.map(pickKeepId))
  const illegal = (pageIds as string[]).filter((p) => keepIds.has(p))
  if (illegal.length) {
    return NextResponse.json({ error: 'Cannot archive KEEP pages', pageIds: illegal }, { status: 400 })
  }

  const results = await archiveBatch(pageIds as string[], token)

  const prevDecisions = DecisionsSchema.parse(row.decisions ?? {})
  const nextDecisions = { ...prevDecisions }
  const now = new Date().toISOString()
  for (const r of results) {
    nextDecisions[r.pageId] = r.status === 'archived'
      ? { status: 'archived', at: now }
      : { status: 'failed', at: now, error: r.error }
  }
  await db.update(notionDedupeReports).set({ decisions: nextDecisions }).where(eq(notionDedupeReports.id, id))

  const archived = results.filter((r) => r.status === 'archived').length
  const failed = results.filter((r) => r.status === 'failed').map((r) => ({ pageId: r.pageId, error: r.error }))
  return NextResponse.json({ archived, failed })
}
