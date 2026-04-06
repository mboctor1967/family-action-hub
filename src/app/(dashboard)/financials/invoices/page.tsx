import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { InvoiceReaderView } from '@/components/financials/invoices/invoice-reader-view'

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as any).role !== 'admin') {
    return <div className="text-center py-12 text-muted-foreground">Access denied.</div>
  }

  const params = await searchParams
  const tab = (params.tab ?? 'suppliers') as 'suppliers' | 'invoices' | 'history'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice Scanner"
        subtitle="Scan Gmail for supplier invoices, extract data, link to transactions"
      />
      <InvoiceReaderView initialTab={tab} />
    </div>
  )
}
