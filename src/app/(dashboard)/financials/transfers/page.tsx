import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TransferDetectView } from '@/components/financials/transfer-detect-view'

export default async function TransfersPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as any).role !== 'admin') {
    return <div className="text-center py-12 text-muted-foreground">Access denied.</div>
  }
  return <TransferDetectView />
}
