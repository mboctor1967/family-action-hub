'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { AccountFilter, type FilterState } from './account-filter'
import { SpendingTab } from './spending-tab'

export function SpendingPageView() {
  const router = useRouter()
  const [appliedFilter, setAppliedFilter] = useState<FilterState>({ entityIds: [], accountIds: [] })
  const [filterKey, setFilterKey] = useState(0)

  const handleFilterChange = useCallback((f: FilterState) => {
    setAppliedFilter(f)
    setFilterKey(k => k + 1)
  }, [])

  function goToCategorize(search?: string) {
    if (search) router.push(`/financials/categorize?search=${encodeURIComponent(search)}`)
    else router.push('/financials/categorize')
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Spending Analysis" subtitle="Category breakdown, biggest transactions, and drill-down" />
      <AccountFilter onFilterChange={handleFilterChange} storageKey="spending" />
      <SpendingTab filter={appliedFilter} filterKey={filterKey} onCategorize={goToCategorize} />
    </div>
  )
}
