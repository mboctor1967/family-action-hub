'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AccountFilter, type FilterState } from './account-filter'
import { OverviewTab } from './overview-tab'
import { Upload } from 'lucide-react'

export function FinancialsTabs() {
  const [appliedFilter, setAppliedFilter] = useState<FilterState>({ entityIds: [], accountIds: [] })
  const [filterKey, setFilterKey] = useState(0)

  const handleFilterChange = useCallback((f: FilterState) => {
    setAppliedFilter(f)
    setFilterKey(k => k + 1)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Link href="/financials/import">
          <Button size="sm" className="gap-1.5">
            <Upload className="h-4 w-4" />
            Import Statements
          </Button>
        </Link>
      </div>

      <AccountFilter onFilterChange={handleFilterChange} storageKey="financials-overview" />

      <OverviewTab filter={appliedFilter} filterKey={filterKey} />
    </div>
  )
}
