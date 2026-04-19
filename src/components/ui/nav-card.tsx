import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { ExternalLink } from 'lucide-react'

interface NavCardProps {
  title: string
  href: string
  icon: LucideIcon
  iconColor?: string
  iconBg?: string
  stats?: Array<{ label: string; value: string | number }>
  external?: boolean
  badge?: string
  badgeVariant?: 'default' | 'info' | 'warning' | 'danger'
  disabled?: boolean
  /** Pure-display card — no link wrapper, no hover affordance, not dimmed. For surfaces like the WhatsApp bot status where the card is informational only. */
  informational?: boolean
}

/**
 * Compact vertical navigation card used on the home page.
 * Icon + title + optional stats row. No description — the home page is the sole nav hub.
 */
export function NavCard({
  title,
  href,
  icon: Icon,
  iconColor = 'text-blue-600',
  iconBg = 'bg-blue-50',
  stats,
  external = false,
  badge,
  badgeVariant = 'default',
  disabled = false,
  informational = false,
}: NavCardProps) {
  const badgeStyles = {
    default: 'text-gray-500 bg-gray-100',
    info: 'text-blue-700 bg-blue-100',
    warning: 'text-amber-700 bg-amber-100',
    danger: 'text-red-700 bg-red-100',
  }
  const content = (
    <div
      className={cn(
        'group h-full bg-white rounded-2xl border border-gray-100 shadow-sm p-3 transition-all',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : informational
            ? ''
            : 'hover:shadow-md hover:border-blue-200 cursor-pointer'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className={cn('p-2 rounded-md', iconBg)}>
          <Icon className={cn('h-4 w-4', iconColor)} />
        </div>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', badgeStyles[badgeVariant])}>
              {badge}
            </span>
          )}
          {external && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </div>
      <h3
        className={cn(
          'text-sm font-semibold text-gray-900 transition-colors',
          informational ? '' : 'group-hover:text-blue-700',
        )}
      >
        {title}
      </h3>
      {stats && stats.length > 0 && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
          {stats.map((s, i) => (
            <div key={i} className="flex-1 min-w-0">
              <p className="text-base font-bold text-gray-800 truncate">{s.value}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  if (disabled || informational) return <div>{content}</div>

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    )
  }

  return <Link href={href}>{content}</Link>
}
