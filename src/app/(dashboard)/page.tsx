import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  tasks,
  scanRuns,
  emailsScanned,
  notionDedupeReports,
  whatsappProcessedMessages,
} from '@/lib/db/schema'
import { inArray, sql, eq, desc, and, lt } from 'drizzle-orm'
import { NavCard } from '@/components/ui/nav-card'
import { PageHeader } from '@/components/ui/page-header'
import {
  CheckSquare,
  Mail,
  BookOpen,
  MessageSquare,
  Wallet,
} from 'lucide-react'

/**
 * Money lives in its own app. The hub's 13 financial cards and their 16 queries
 * against the shared financial tables were removed in P3; this is the one link left.
 */
const BOCTOR_FINANCIALS_URL = 'https://boctor-financials.vercel.app'

export default async function HomePage() {
  const session = await auth()
  if (!session?.user) return null

  const userName = session.user.name?.split(' ')[0] || 'there'
  const isAdmin = (session.user as { role?: string }).role === 'admin'

  const [
    activeTaskCount,
    urgentTaskCount,
    overdueTaskCount,
    lastScan,
    unreviewedTriageCount,
    latestDedupe,
    whatsappStats,
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(tasks).where(inArray(tasks.status, ['new', 'in_progress', 'waiting'])).then(r => Number(r[0]?.n || 0)),
    db.select({ n: sql<number>`count(*)` }).from(tasks).where(and(inArray(tasks.status, ['new', 'in_progress', 'waiting']), eq(tasks.priority, 'urgent'))).then(r => Number(r[0]?.n || 0)),
    db.select({ n: sql<number>`count(*)` }).from(tasks).where(and(inArray(tasks.status, ['new', 'in_progress', 'waiting']), lt(tasks.dueDate, sql`now()`))).then(r => Number(r[0]?.n || 0)),
    db.select({ completedAt: scanRuns.completedAt, count: scanRuns.actionableCount }).from(scanRuns).where(eq(scanRuns.status, 'completed')).orderBy(desc(scanRuns.completedAt)).limit(1).then(r => r[0] || null),

    db.select({ n: sql<number>`count(*)` }).from(emailsScanned).where(eq(emailsScanned.triageStatus, 'unreviewed')).then(r => Number(r[0]?.n || 0)),

    isAdmin ? db.select({
      uploadedAt: notionDedupeReports.uploadedAt,
      scanTimestamp: notionDedupeReports.scanTimestamp,
      totalClusters: notionDedupeReports.totalClusters,
      totalPages: notionDedupeReports.totalPages,
      decisions: notionDedupeReports.decisions,
    }).from(notionDedupeReports).orderBy(desc(notionDedupeReports.uploadedAt)).limit(1).then(r => r[0] || null) : Promise.resolve(null),

    isAdmin ? db.select({
      total: sql<number>`count(*)`,
      lastAt: sql<string | null>`max(${whatsappProcessedMessages.receivedAt})`,
    }).from(whatsappProcessedMessages).then(r => r[0] || { total: 0, lastAt: null }) : Promise.resolve({ total: 0, lastAt: null }),
  ])

  const lastScanLabel = lastScan?.completedAt
    ? new Date(lastScan.completedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    : '—'

  const whatsappCard = (() => {
    const total = Number(whatsappStats?.total || 0)
    const lastAtIso = whatsappStats?.lastAt as string | null
    const allowedCount = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? '')
      .split(',').map(s => s.trim()).filter(Boolean).length
    let lastLabel = '—'
    if (lastAtIso) {
      const diffMs = Date.now() - new Date(lastAtIso).getTime()
      const diffMin = Math.round(diffMs / 60000)
      if (diffMin < 1) lastLabel = 'just now'
      else if (diffMin < 60) lastLabel = `${diffMin}m ago`
      else if (diffMin < 1440) lastLabel = `${Math.round(diffMin / 60)}h ago`
      else lastLabel = `${Math.round(diffMin / 1440)}d ago`
    }
    return { total, lastLabel, allowedCount }
  })()

  const dedupeStats = (() => {
    if (!latestDedupe) return null
    const dec = (latestDedupe.decisions ?? {}) as Record<string, { status: string }>
    const archived = Object.values(dec).filter((d) => d.status === 'archived').length
    const potentialDeletes = Math.max(0, latestDedupe.totalPages - latestDedupe.totalClusters)
    const pending = Math.max(0, potentialDeletes - archived)
    const scanDate = latestDedupe.uploadedAt
      ? new Date(latestDedupe.uploadedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
      : '—'
    return { pending, potentialDeletes, archived, scanDate }
  })()

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hi ${userName} 👋`}
        subtitle="Your family hub — all your tools in one place."
        backTo={null}
        size="large"
      />

      {/* Tasks & Inbox */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tasks & Inbox</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NavCard
            title="Tasks"
            href="/tasks"
            icon={CheckSquare}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
            stats={[
              { label: 'Active', value: activeTaskCount },
              { label: 'Urgent', value: urgentTaskCount },
              { label: 'Overdue', value: overdueTaskCount },
            ]}
          />
          <NavCard
            title="Gmail Scanner"
            href="/scan"
            icon={Mail}
            iconColor="text-purple-600"
            iconBg="bg-purple-50"
            badge={unreviewedTriageCount > 0 ? `${unreviewedTriageCount} unreviewed` : undefined}
            badgeVariant="warning"
            stats={[
              { label: 'Last scan', value: lastScanLabel },
              { label: 'To review', value: unreviewedTriageCount },
            ]}
          />
          {isAdmin && (
            <NavCard
              title="WhatsApp Bot"
              href=""
              icon={MessageSquare}
              iconColor="text-green-600"
              iconBg="bg-green-50"
              informational
              stats={[
                { label: 'Messages', value: whatsappCard.total },
                { label: 'Last', value: whatsappCard.lastLabel },
                { label: 'Users', value: whatsappCard.allowedCount },
              ]}
            />
          )}
        </div>
      </div>

      {/* Other tools */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Other Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isAdmin && (
            <NavCard
              title="Boctor Financials"
              href={BOCTOR_FINANCIALS_URL}
              icon={Wallet}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
              external
            />
          )}
          <NavCard
            title="Notion"
            href="/notion"
            icon={BookOpen}
            iconColor="text-slate-700"
            iconBg="bg-slate-100"
            stats={
              dedupeStats
                ? [
                    { label: 'Pending deletes', value: dedupeStats.pending },
                    { label: `Scanned (${dedupeStats.scanDate})`, value: dedupeStats.potentialDeletes },
                  ]
                : [{ label: 'No scan yet', value: '—' }]
            }
          />
        </div>
      </div>
    </div>
  )
}
