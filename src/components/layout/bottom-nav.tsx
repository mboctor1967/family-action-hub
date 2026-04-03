'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Inbox, CheckSquare, Scan, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: 'Inbox', icon: Inbox },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/scan', label: 'Scan', icon: Scan },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border md:hidden">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))
          const isScan = item.href === '/scan'
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full gap-1 text-xs',
                isActive
                  ? 'text-blue-600 font-medium'
                  : isScan
                    ? 'text-blue-500'
                    : 'text-muted-foreground'
              )}
            >
              {isScan ? (
                <span className={cn(
                  'flex items-center justify-center h-10 w-10 -mt-4 rounded-full shadow-md',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-500 text-white'
                )}>
                  <item.icon className="h-5 w-5" />
                </span>
              ) : (
                <item.icon className={cn('h-5 w-5', isActive && 'text-blue-600')} />
              )}
              <span className={cn(isScan && '-mt-1')}>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
