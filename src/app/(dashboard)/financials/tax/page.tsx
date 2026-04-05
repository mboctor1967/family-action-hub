import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { TaxPrepView } from '@/components/financials/tax/tax-prep-view'

export default async function TaxPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; tab?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as any).role !== 'admin') {
    return <div className="text-center py-12 text-muted-foreground">Access denied.</div>
  }

  const params = await searchParams
  const currentFy = getCurrentFyLabel()
  const fy = params.fy ?? currentFy
  const tab = (params.tab ?? 'overview') as 'overview' | 'invoices' | 'export'

  return (
    <div className="space-y-6">
      <PageHeader title="Tax Prep" subtitle="Accountant pack generator" />
      <TaxPrepView initialFy={fy} initialTab={tab} />
    </div>
  )
}

function getCurrentFyLabel(): string {
  const now = new Date()
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  const endYear = startYear + 1
  return `FY${startYear}-${String(endYear).slice(-2)}`
}
