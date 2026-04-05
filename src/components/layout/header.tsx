'use client'

import { signOut } from 'next-auth/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, User } from 'lucide-react'

interface HeaderProps {
  user: {
    name?: string
    email?: string
    avatar_url?: string
  }
}

export function Header({ user }: HeaderProps) {
  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : user.email?.[0]?.toUpperCase() || '?'

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-border">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-baseline gap-1">
          <h1 className="text-lg font-bold text-blue-900">BOCTOR Family Hub</h1>
          <span className="text-[10px] text-muted-foreground font-medium">v0.1</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full outline-none">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.avatar_url} alt={user.name} />
              <AvatarFallback className="bg-blue-100 text-blue-700 text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>
              <User className="mr-2 h-4 w-4" />
              {user.name || user.email}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/login' })}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
