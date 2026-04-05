import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SubscriptionsTab } from '@/components/financials/subscriptions-tab'
import { PageHeader } from '@/components/ui/page-header'

export default async function SubscriptionsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as any).role !== 'admin') {
    return <div className="text-center py-12 text-muted-foreground">Access denied.</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions" subtitle="Recurring charges, annual cost, and duplicate detection" />
      <SubscriptionsTab />
    </div>
  )
}
