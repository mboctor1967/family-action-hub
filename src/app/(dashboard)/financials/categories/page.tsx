import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { CategoryManagerView } from '@/components/financials/category-manager-view'

export default async function CategoriesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as any).role !== 'admin') {
    return <div className="text-center py-12 text-muted-foreground">Access denied.</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Category Manager"
        subtitle="Define categories, subcategories, and ATO code mappings per entity type"
      />
      <CategoryManagerView />
    </div>
  )
}
