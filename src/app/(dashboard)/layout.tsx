import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Providers } from '@/components/providers'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) redirect('/login')

  return (
    <Providers>
      <div className="flex flex-col min-h-screen">
        <Header
          user={{
            name: session.user.name || session.user.email || '',
            email: session.user.email || '',
            avatar_url: session.user.image || undefined,
          }}
        />
        <main className="flex-1 pb-20 md:pb-4">
          <div className="max-w-4xl mx-auto px-4 py-4">
            {children}
          </div>
        </main>
        <BottomNav />
      </div>
    </Providers>
  )
}
