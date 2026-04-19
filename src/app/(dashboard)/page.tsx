import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  tasks,
  financialTransactions,
  financialAccounts,
  financialEntities,
  financialStatements,
  scanRuns,
  emailsScanned,
  notionDedupeReports,
  whatsappProcessedMessages,
} from '@/lib/db/schema'
import { inArray, sql, eq, desc, isNull, and, gte, lte, lt } from 'drizzle-orm'
import { NavCard } from '@/components/ui/nav-card'
import { PageHeader } from '@/components/ui/page-header'
import {
  CheckSquare,
  BarChart3,
  Upload,
  Tag,
  Settings2,
  SlidersHorizontal,
  ListTree,
  FileText,
  ScanLine,
  Car,
  Mail,
  ArrowLeftRight,
  PieChart,
  Repeat,
  CalendarDays,
  Copy,
  BookOpen,
  MessageSquare,
} from 'lucide-react'

const formatAUD0 = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v)

function fyStart(d: Date): Date {
  return new Date(d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1, 6, 1)
}

export default async function HomePage() {
  const session = await auth()
  if (!session?.user) return null

  const userName = session.user.name?.split(' ')[0] || 'there'
  const isAdmin = (session.user as any).role === 'admin'

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  const fyStartStr = fyStart(now).toISOString().slice(0, 10)

  const [
    activeTaskCount,
    urgentTaskCount,
    overdueTaskCount,
    lastScan,
    accountCount,
    entityCount,
    unmappedAccountCount,
    statementCount,
    lastStatement,
    confirmedTransferCount,
    totalMerchants,
    categorisedMerchants,
    aiSuggestedMerchants,
    monthIncome,
    monthExpense,
    topCategoryRow,
    activeSubsRow,
    coverageRow,
    taxRow,
    unreviewedTriageCount,
    latestDedupe,
    whatsappStats,
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(tasks).where(inArray(tasks.status, ['new', 'in_progress', 'waiting'])).then(r => Number(r[0]?.n || 0)),
    db.select({ n: sql<number>`count(*)` }).from(tasks).where(and(inArray(tasks.status, ['new', 'in_progress', 'waiting']), eq(tasks.priority, 'urgent'))).then(r => Number(r[0]?.n || 0)),
    db.select({ n: sql<number>`count(*)` }).from(tasks).where(and(inArray(tasks.status, ['new', 'in_progress', 'waiting']), lt(tasks.dueDate, sql`now()`))).then(r => Number(r[0]?.n || 0)),
    db.select({ completedAt: scanRuns.completedAt, count: scanRuns.actionableCount }).from(scanRuns).where(eq(scanRuns.status, 'completed')).orderBy(desc(scanRuns.completedAt)).limit(1).then(r => r[0] || null),

    isAdmin ? db.select({ n: sql<number>`count(*)` }).from(financialAccounts).then(r => Number(r[0]?.n || 0)) : Promise.resolve(0),
    isAdmin ? db.select({ n: sql<number>`count(*)` }).from(financialEntities).then(r => Number(r[0]?.n || 0)) : Promise.resolve(0),
    isAdmin ? db.select({ n: sql<number>`count(*)` }).from(financialAccounts).where(isNull(financialAccounts.entityId)).then(r => Number(r[0]?.n || 0)) : Promise.resolve(0),

    isAdmin ? db.select({ n: sql<number>`count(*)` }).from(financialStatements).then(r => Number(r[0]?.n || 0)) : Promise.resolve(0),
    isAdmin ? db.select({ importedAt: financialStatements.importedAt }).from(financialStatements).orderBy(desc(financialStatements.importedAt)).limit(1).then(r => r[0] || null) : Promise.resolve(null),

    isAdmin ? db.select({ n: sql<number>`count(distinct ${financialTransactions.transferPairId})` }).from(financialTransactions).where(sql`${financialTransactions.transferPairId} is not null`).then(r => Number(r[0]?.n || 0)) : Promise.resolve(0),

    isAdmin ? db.select({ n: sql<number>`count(distinct ${financialTransactions.merchantName})` }).from(financialTransactions).where(sql`${financialTransactions.merchantName} is not null`).then(r => Number(r[0]?.n || 0)) : Promise.resolve(0),
    isAdmin ? db.select({ n: sql<number>`count(distinct ${financialTransactions.merchantName})` }).from(financialTransactions).where(sql`${financialTransactions.merchantName} is not null and ${financialTransactions.category} is not null and ${financialTransactions.category} != 'OTHER'`).then(r => Number(r[0]?.n || 0)) : Promise.resolve(0),
    isAdmin ? db.select({ n: sql<number>`count(distinct ${financialTransactions.merchantName})` }).from(financialTransactions).where(sql`${financialTransactions.merchantName} is not null and ${financialTransactions.aiSuggestedCategory} is not null`).then(r => Number(r[0]?.n || 0)) : Promise.resolve(0),

    isAdmin ? db.select({ total: sql<number>`coalesce(sum(${financialTransactions.amount}::numeric), 0)` }).from(financialTransactions).where(and(
      gte(financialTransactions.transactionDate, monthStart),
      lte(financialTransactions.transactionDate, monthEnd),
      sql`${financialTransactions.amount}::numeric > 0`,
      isNull(financialTransactions.transferPairId),
    )).then(r => Number(r[0]?.total || 0)) : Promise.resolve(0),

    isAdmin ? db.select({ total: sql<number>`coalesce(sum(abs(${financialTransactions.amount}::numeric)), 0)` }).from(financialTransactions).where(and(
      gte(financialTransactions.transactionDate, monthStart),
      lte(financialTransactions.transactionDate, monthEnd),
      sql`${financialTransactions.amount}::numeric < 0`,
      isNull(financialTransactions.transferPairId),
    )).then(r => Number(r[0]?.total || 0)) : Promise.resolve(0),

    isAdmin ? db.select({
      category: financialTransactions.category,
      total: sql<number>`sum(abs(${financialTransactions.amount}::numeric))`,
    }).from(financialTransactions).where(and(
      gte(financialTransactions.transactionDate, monthStart),
      lte(financialTransactions.transactionDate, monthEnd),
      sql`${financialTransactions.amount}::numeric < 0`,
      isNull(financialTransactions.transferPairId),
    )).groupBy(financialTransactions.category).orderBy(sql`sum(abs(${financialTransactions.amount}::numeric)) desc`).limit(1).then(r => r[0] || null) : Promise.resolve(null),

    isAdmin ? db.select({
      count: sql<number>`count(distinct ${financialTransactions.merchantName})`,
      monthlyCost: sql<number>`coalesce(avg(case when ${financialTransactions.subscriptionFrequency} = 'weekly' then abs(${financialTransactions.amount}::numeric) * 4.33
        when ${financialTransactions.subscriptionFrequency} = 'annual' then abs(${financialTransactions.amount}::numeric) / 12
        else abs(${financialTransactions.amount}::numeric) end), 0)`,
    }).from(financialTransactions).where(eq(financialTransactions.isSubscription, true)).then(r => r[0] || { count: 0, monthlyCost: 0 }) : Promise.resolve({ count: 0, monthlyCost: 0 }),

    isAdmin ? db.select({
      covered: sql<number>`count(distinct to_char(${financialStatements.statementStart}, 'YYYY-MM'))`,
    }).from(financialStatements).where(sql`${financialStatements.statementStart} is not null`).then(r => Number(r[0]?.covered || 0)) : Promise.resolve(0),

    isAdmin ? db.select({
      total: sql<number>`coalesce(sum(abs(${financialTransactions.amount}::numeric)), 0)`,
      count: sql<number>`count(*)`,
    }).from(financialTransactions).where(and(
      eq(financialTransactions.isTaxDeductible, true),
      gte(financialTransactions.transactionDate, fyStartStr),
    )).then(r => r[0] || { total: 0, count: 0 }) : Promise.resolve({ total: 0, count: 0 }),

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
  const lastImportLabel = lastStatement?.importedAt
    ? new Date(lastStatement.importedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    : '—'
  const topCat = topCategoryRow?.category || '—'
  const monthSpending = Number(topCategoryRow?.total || 0)

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

      {/* Financials */}
      {isAdmin && (
        <div className="space-y-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Financials</h2>

          {/* 1. Setup */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold text-white bg-gray-600 rounded px-1.5 py-0.5">1</span>
              <span className="text-xs font-semibold text-gray-700">Setup</span>
              <span className="text-[10px] text-muted-foreground">— one-time configuration</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <NavCard
                title="Accounts & Entities"
                href="/financials/accounts"
                icon={Settings2}
                iconColor="text-cyan-600"
                iconBg="bg-cyan-50"
                stats={[
                  { label: 'Accounts', value: accountCount },
                  { label: 'Entities', value: entityCount },
                  { label: 'Unmapped', value: unmappedAccountCount },
                ]}
              />
              <NavCard
                title="Assumptions & Rules"
                href="/financials/assumptions"
                icon={SlidersHorizontal}
                iconColor="text-rose-600"
                iconBg="bg-rose-50"
              />
              <NavCard
                title="Category Manager"
                href="/financials/categories"
                icon={ListTree}
                iconColor="text-teal-600"
                iconBg="bg-teal-50"
                stats={[
                  { label: 'Categories', value: '19' },
                  { label: 'Mapped', value: '42' },
                ]}
              />
            </div>
          </div>

          {/* 2. Ingest */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold text-white bg-indigo-600 rounded px-1.5 py-0.5">2</span>
              <span className="text-xs font-semibold text-gray-700">Ingest</span>
              <span className="text-[10px] text-muted-foreground">— bring in new data</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <NavCard
                title="Import Statements"
                href="/financials/import"
                icon={Upload}
                iconColor="text-indigo-600"
                iconBg="bg-indigo-50"
                stats={[
                  { label: 'Statements', value: statementCount },
                  { label: 'Last import', value: lastImportLabel },
                ]}
              />
              <NavCard
                title="Statement Coverage"
                href="/financials/coverage"
                icon={CalendarDays}
                iconColor="text-yellow-600"
                iconBg="bg-yellow-50"
                stats={[
                  { label: 'Months covered', value: coverageRow },
                ]}
              />
              <NavCard
                title="Invoice Scanner"
                href="/financials/invoices"
                icon={ScanLine}
                iconColor="text-emerald-600"
                iconBg="bg-emerald-50"
              />
            </div>
          </div>

          {/* 3. Clean */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold text-white bg-sky-600 rounded px-1.5 py-0.5">3</span>
              <span className="text-xs font-semibold text-gray-700">Clean</span>
              <span className="text-[10px] text-muted-foreground">— classify and tidy transactions</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <NavCard
                title="Detect Transfers"
                href="/financials/transfers"
                icon={ArrowLeftRight}
                iconColor="text-sky-600"
                iconBg="bg-sky-50"
                stats={[
                  { label: 'Confirmed', value: confirmedTransferCount },
                ]}
              />
              <NavCard
                title="Categorise"
                href="/financials/categorize"
                icon={Tag}
                iconColor="text-amber-600"
                iconBg="bg-amber-50"
                stats={[
                  { label: 'Done', value: categorisedMerchants },
                  { label: 'AI', value: aiSuggestedMerchants },
                  { label: 'Total', value: totalMerchants },
                ]}
              />
              <NavCard
                title="Duplicate Detection"
                href="/financials/duplicates"
                icon={Copy}
                iconColor="text-red-600"
                iconBg="bg-red-50"
                badge="Coming soon"
                disabled
              />
            </div>
          </div>

          {/* 4. Analyse */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold text-white bg-green-600 rounded px-1.5 py-0.5">4</span>
              <span className="text-xs font-semibold text-gray-700">Analyse</span>
              <span className="text-[10px] text-muted-foreground">— understand where money flows</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <NavCard
                title="Financial Overview"
                href="/financials"
                icon={BarChart3}
                iconColor="text-green-600"
                iconBg="bg-green-50"
                stats={[
                  { label: 'Income (mo)', value: formatAUD0(Number(monthIncome)) },
                  { label: 'Expenses (mo)', value: formatAUD0(Number(monthExpense)) },
                ]}
              />
              <NavCard
                title="Spending Analysis"
                href="/financials/spending"
                icon={PieChart}
                iconColor="text-pink-600"
                iconBg="bg-pink-50"
                stats={[
                  { label: 'Spent (mo)', value: formatAUD0(monthSpending) },
                  { label: 'Top', value: topCat.length > 10 ? topCat.slice(0, 10) + '…' : topCat },
                ]}
              />
              <NavCard
                title="Subscriptions"
                href="/financials/subscriptions"
                icon={Repeat}
                iconColor="text-teal-600"
                iconBg="bg-teal-50"
                stats={[
                  { label: 'Active', value: Number(activeSubsRow.count) },
                  { label: 'Monthly', value: formatAUD0(Number(activeSubsRow.monthlyCost)) },
                ]}
              />
            </div>
          </div>

          {/* 5. Output */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold text-white bg-violet-600 rounded px-1.5 py-0.5">5</span>
              <span className="text-xs font-semibold text-gray-700">Output</span>
              <span className="text-[10px] text-muted-foreground">— end-of-year reports</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <NavCard
                title="Tax Prep"
                href="/financials/tax"
                icon={FileText}
                iconColor="text-violet-600"
                iconBg="bg-violet-50"
                stats={[
                  { label: 'Deductible', value: formatAUD0(Number(taxRow.total)) },
                  { label: 'Txns', value: Number(taxRow.count) },
                ]}
              />
            </div>
          </div>
        </div>
      )}

      {/* Other tools */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Other Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
          <NavCard
            title="Vehicle Logbook"
            href="/vehicles"
            icon={Car}
            iconColor="text-orange-600"
            iconBg="bg-orange-50"
            badge="Coming soon"
            disabled
          />
        </div>
      </div>
    </div>
  )
}
