import { db } from '@/lib/db'
import { notionDedupeReports } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'
import { DedupeInstructions } from '@/components/notion/dedupe-instructions'
import { DedupeUploadButton } from '@/components/notion/dedupe-upload-button'
import { DedupeReportsList } from '@/components/notion/dedupe-reports-list'

export default async function DedupeLandingPage() {
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

  const reports = rows.map((r) => {
    const dec = (r.decisions ?? {}) as Record<string, { status: string }>
    const archivedCount = Object.values(dec).filter((d) => d.status === 'archived').length
    const { decisions: _decisions, ...rest } = r
    void _decisions
    return {
      ...rest,
      uploadedAt: rest.uploadedAt?.toISOString?.() ?? String(rest.uploadedAt),
      archivedCount,
    }
  })

  return (
    <div className="space-y-5">
      <DedupeInstructions />
      <div><DedupeUploadButton /></div>
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Past reports</h2>
        <DedupeReportsList reports={reports} />
      </div>
    </div>
  )
}
