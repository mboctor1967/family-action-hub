import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SpendingPageView } from '@/components/financials/spending-page-view'

export default async function SpendingPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as any).role !== 'admin') {
    return <div className="text-center py-12 text-muted-foreground">Access denied.</div>
  }

  return <SpendingPageView />
}
