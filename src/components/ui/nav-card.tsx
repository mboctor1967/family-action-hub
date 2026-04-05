import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { ExternalLink } from 'lucide-react'

interface NavCardProps {
  title: string
  description: string
  href: string
  icon: LucideIcon
  iconColor?: string
  iconBg?: string
  stats?: Array<{ label: string; value: string | number }>
  external?: boolean
  badge?: string
  disabled?: boolean
}

/**
 * Vertical navigation card used on the home page.
 * Icon at top, then title + description, optional stats row at the bottom.
 */
export function NavCard({
  title,
  description,
  href,
  icon: Icon,
  iconColor = 'text-blue-600',
  iconBg = 'bg-blue-50',
  stats,
  external = false,
  badge,
  disabled = false,
}: NavCardProps) {
  const content = (
    <div
      className={cn(
        'group h-full bg-white rounded-2xl border border-gray-100 shadow-sm p-5 transition-all',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:shadow-md hover:border-blue-200 cursor-pointer'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('p-2.5 rounded-lg', iconBg)}>
          <Icon className={cn('h-5 w-5', iconColor)} />
        </div>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              {badge}
            </span>
          )}
          {external && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      {stats && stats.length > 0 && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
          {stats.map((s, i) => (
            <div key={i} className="flex-1 min-w-0">
              <p className="text-lg font-bold text-gray-800 truncate">{s.value}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  if (disabled) return <div>{content}</div>

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    )
  }

  return <Link href={href}>{content}</Link>
}
