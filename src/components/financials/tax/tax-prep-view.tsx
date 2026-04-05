'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { OverviewTab } from './overview-tab'
import { InvoicesTab } from './invoices-tab'
import { ExportTab } from './export-tab'
import { FyPicker } from './fy-picker'

type TabKey = 'overview' | 'invoices' | 'export'

export function TaxPrepView({
  initialFy,
  initialTab,
}: {
  initialFy: string
  initialTab: TabKey
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [fy, setFy] = useState(initialFy)
  const [tab, setTab] = useState<TabKey>(initialTab)

  const updateUrl = (nextFy: string, nextTab: TabKey) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('fy', nextFy)
    params.set('tab', nextTab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const onFyChange = (v: string) => {
    setFy(v)
    updateUrl(v, tab)
  }
  const onTabChange = (v: TabKey) => {
    setTab(v)
    updateUrl(fy, v)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <FyPicker value={fy} onChange={onFyChange} />
      </div>

      <div className="border-b border-border">
        <nav className="flex gap-1">
          <TabButton active={tab === 'overview'} onClick={() => onTabChange('overview')}>
            Overview
          </TabButton>
          <TabButton active={tab === 'invoices'} onClick={() => onTabChange('invoices')}>
            Invoices
          </TabButton>
          <TabButton active={tab === 'export'} onClick={() => onTabChange('export')}>
            Export
          </TabButton>
        </nav>
      </div>

      <div>
        {tab === 'overview' && <OverviewTab fy={fy} />}
        {tab === 'invoices' && <InvoicesTab fy={fy} />}
        {tab === 'export' && <ExportTab fy={fy} />}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ' +
        (active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300')
      }
    >
      {children}
    </button>
  )
}
