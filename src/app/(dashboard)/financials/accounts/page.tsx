import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AccountsTab } from '@/components/financials/accounts-tab'
import { PageHeader } from '@/components/ui/page-header'

export default async function AccountsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as any).role !== 'admin') {
    return <div className="text-center py-12 text-muted-foreground">Access denied.</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Accounts & Entities" />
      <AccountsTab />
    </div>
  )
}
