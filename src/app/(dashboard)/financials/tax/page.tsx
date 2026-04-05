import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TaxTab } from '@/components/financials/tax-tab'
import { PageHeader } from '@/components/ui/page-header'

export default async function TaxPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as any).role !== 'admin') {
    return <div className="text-center py-12 text-muted-foreground">Access denied.</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Tax Prep" />
      <TaxTab />
    </div>
  )
}
