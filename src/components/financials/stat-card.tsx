import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  iconColor?: string
  helper?: string
}

export function StatCard({ label, value, icon: Icon, iconColor = 'bg-blue-600', helper }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-start gap-3">
      <div className={cn('p-2 rounded-lg text-white', iconColor)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {helper && <p className="text-xs text-gray-400 mt-0.5">{helper}</p>}
      </div>
    </div>
  )
}
