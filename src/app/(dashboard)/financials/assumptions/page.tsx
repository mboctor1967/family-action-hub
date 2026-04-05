import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AssumptionsView } from '@/components/financials/assumptions-view'

export default async function AssumptionsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as any).role !== 'admin') {
    return <div className="text-center py-12 text-muted-foreground">Access denied.</div>
  }

  return (
    <div className="space-y-6">
      <AssumptionsView />
    </div>
  )
}
