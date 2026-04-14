import { db } from '@/lib/db'
import { notionDedupeReports } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { DedupeReview } from '@/components/notion/dedupe-review'
import { DedupeReportSchema, DecisionsSchema } from '@/lib/notion/dedupe-schema'

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [row] = await db.select().from(notionDedupeReports).where(eq(notionDedupeReports.id, id)).limit(1)
  if (!row) notFound()

  const report = DedupeReportSchema.parse(row.report)
  const decisions = DecisionsSchema.parse(row.decisions ?? {})

  return <DedupeReview reportId={row.id} report={report} initialDecisions={decisions} />
}
