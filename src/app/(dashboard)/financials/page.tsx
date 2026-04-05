import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { FinancialsTabs } from '@/components/financials/financials-tabs'
import { PageHeader } from '@/components/ui/page-header'

export default async function FinancialsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as any).role !== 'admin') {
    return (
      <div className="text-center py-12 text-muted-foreground">
        You don&apos;t have access to this page.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Financial Overview" subtitle="Income vs expenses and monthly trends" />
      <FinancialsTabs />
    </div>
  )
}
