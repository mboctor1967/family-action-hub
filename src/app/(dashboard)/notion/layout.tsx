import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import Link from 'next/link'

export default async function NotionLayout({ children }: { children: React.ReactNode }) {
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
      <PageHeader title="Notion" subtitle="Workspace management tools" />
      <div className="inline-flex w-fit items-center justify-center rounded-lg bg-muted p-[3px] h-8">
        <Link
          href="/notion/dedupe"
          className="relative inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 rounded-md px-3 py-0.5 text-sm font-medium whitespace-nowrap bg-background text-foreground shadow-sm transition-all"
        >
          Dedupe
        </Link>
      </div>
      <div>{children}</div>
    </div>
  )
}
