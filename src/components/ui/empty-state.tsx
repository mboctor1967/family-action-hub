import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  /** Remove the white card background — use when already inside a container */
  bare?: boolean
  className?: string
}

/**
 * Standardized empty state for "no data" scenarios.
 * Icon + headline + description + optional CTA, centered on a white card.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  bare = false,
  className,
}: EmptyStateProps) {
  const content = (
    <div className="flex flex-col items-center text-center py-12 space-y-3">
      <div className="p-3 rounded-full bg-gray-100">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-gray-900">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground max-w-md">{description}</p>
        )}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  )

  if (bare) {
    return <div className={className}>{content}</div>
  }

  return (
    <div
      className={cn(
        'bg-white rounded-2xl border border-gray-100 shadow-sm',
        className
      )}
    >
      {content}
    </div>
  )
}
