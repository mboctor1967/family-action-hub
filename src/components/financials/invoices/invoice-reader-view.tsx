'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { SuppliersTab } from './suppliers-tab'
import { InvoicesListTab } from './invoices-list-tab'

type TabKey = 'suppliers' | 'invoices' | 'history'

export function InvoiceReaderView({ initialTab }: { initialTab: TabKey }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<TabKey>(initialTab)

  const onTabChange = (v: TabKey) => {
    setTab(v)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', v)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="space-y-5">
      <div className="border-b border-border">
        <nav className="flex gap-1">
          <TabBtn active={tab === 'suppliers'} onClick={() => onTabChange('suppliers')}>Suppliers</TabBtn>
          <TabBtn active={tab === 'invoices'} onClick={() => onTabChange('invoices')}>Invoices</TabBtn>
          <TabBtn active={tab === 'history'} onClick={() => onTabChange('history')}>Scan History</TabBtn>
        </nav>
      </div>
      <div>
        {tab === 'suppliers' && <SuppliersTab />}
        {tab === 'invoices' && <InvoicesListTab />}
        {tab === 'history' && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Scan history coming in a future update. For now, check the Invoices tab after running a scan.
          </div>
        )}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
