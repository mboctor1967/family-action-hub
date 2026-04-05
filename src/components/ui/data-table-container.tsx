import { cn } from '@/lib/utils'

interface DataTableContainerProps {
  children: React.ReactNode
  title?: string
  description?: string
  action?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

/**
 * Wrapper for tables that provides consistent outer card styling, optional title bar, and footer.
 * Use this around shadcn <Table> primitives for a consistent look across pages.
 */
export function DataTableContainer({
  children,
  title,
  description,
  action,
  footer,
  className,
}: DataTableContainerProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden',
        className
      )}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div>{children}</div>
      {footer && (
        <div className="p-4 border-t border-gray-100 bg-gray-50/50">{footer}</div>
      )}
    </div>
  )
}
