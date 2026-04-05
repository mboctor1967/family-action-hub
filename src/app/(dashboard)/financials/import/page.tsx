import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ImportView } from '@/components/financials/import-view'

export default async function ImportPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as any).role !== 'admin') {
    return (
      <div className="text-center py-12 text-muted-foreground">
        You don&apos;t have access to this page.
      </div>
    )
  }

  return <ImportView />
}
