import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon?: LucideIcon
  iconColor?: string
  iconBg?: string
  helper?: string
  /** Pass a color class for the value (e.g. 'text-green-600') */
  valueColor?: string
  className?: string
}

/**
 * Horizontal stat card: icon (colored box) on the left, label + big value on the right.
 * Use for summary stats on dashboard and report pages.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  iconColor = 'text-blue-600',
  iconBg = 'bg-blue-50',
  helper,
  valueColor,
  className,
}: StatCardProps) {
  return (
    <div className={cn('bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-3', className)}>
      {Icon && (
        <div className={cn('p-2.5 rounded-lg shrink-0', iconBg)}>
          <Icon className={cn('h-5 w-5', iconColor)} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className={cn('text-2xl font-bold text-gray-900 truncate', valueColor)}>{value}</p>
        {helper && <p className="text-xs text-gray-400 mt-0.5 truncate">{helper}</p>}
      </div>
    </div>
  )
}
