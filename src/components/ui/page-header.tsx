import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Path to navigate back to. Defaults to '/' (home). Pass null to hide the back button. */
  backTo?: string | null
  /** Optional action slot on the right side (buttons, dropdowns, etc.) */
  action?: React.ReactNode
  /** Use text-2xl instead of text-xl — for the home page greeting */
  size?: 'default' | 'large'
}

export function PageHeader({
  title,
  subtitle,
  backTo = '/',
  action,
  size = 'default',
}: PageHeaderProps) {
  const titleClass = size === 'large' ? 'text-2xl' : 'text-xl'

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {backTo && (
          <Link
            href={backTo}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <div className="min-w-0">
          <h2 className={cn('font-bold text-gray-900 truncate', titleClass)}>{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
