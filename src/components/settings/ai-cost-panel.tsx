'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Sparkles, Loader2 } from 'lucide-react'
import type { AiCostEstimate } from '@/types/financials'

export function AiCostPanel() {
  const [estimate, setEstimate] = useState<AiCostEstimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    loadEstimate()
  }, [])

  async function loadEstimate() {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/ai-cost-estimate')
      if (res.ok) {
        const data = await res.json()
        setEstimate(data)
      }
    } finally {
      setLoading(false)
    }
  }

  async function confirmToggle() {
    if (!estimate) return
    setToggling(true)
    try {
      const res = await fetch('/api/settings/ai-claude-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: !estimate.currentSetting.enabled,
          confirmed: true,
        }),
      })
      if (!res.ok) throw new Error('Toggle failed')
      toast.success(
        estimate.currentSetting.enabled
          ? 'Claude AI disabled — reverting to rule-based proposals'
          : 'Claude AI enabled — next import will use enhanced proposals'
      )
      setShowConfirm(false)
      await loadEstimate()
    } catch {
      toast.error('Failed to update setting')
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-purple-50">
          <Sparkles className="h-5 w-5 text-purple-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-gray-900">Claude AI — ATO Code Proposals</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rule-based proposals (free) are always on. Enable Claude to handle ambiguous cases
            (e.g. Netflix under Software &amp; SaaS should be non-deductible).
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading cost estimate…
        </div>
      )}

      {estimate && (
        <>
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-muted-foreground">
            Model: <span className="font-medium text-gray-900">{estimate.model}</span> · Pricing: ${estimate.pricing.inputPer1M.toFixed(2)}
            /1M input, ${estimate.pricing.outputPer1M.toFixed(2)}/1M output (as of{' '}
            {estimate.pricing.asOf})
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CostCell
              label="Per import"
              sublabel={`${estimate.estimates.perImport.txnCount} txns`}
              cost={estimate.estimates.perImport.cost}
            />
            <CostCell
              label="Monthly"
              sublabel={`${estimate.estimates.monthly.txnCount} txns/mo`}
              cost={estimate.estimates.monthly.cost}
            />
            {estimate.estimates.backfill && (
              <CostCell
                label="Backfill (one-time)"
                sublabel={`${estimate.estimates.backfill.txnCount} existing txns`}
                cost={estimate.estimates.backfill.cost}
                highlight
              />
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={`h-5 w-10 rounded-full transition-colors ${
                    estimate.currentSetting.enabled ? 'bg-purple-600' : 'bg-gray-300'
                  } relative`}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 bg-white rounded-full transition-transform shadow ${
                      estimate.currentSetting.enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {estimate.currentSetting.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowConfirm(true)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {estimate.currentSetting.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            When disabled, only rule-based ATO proposals run during import. All data in the
            Categorise page and export works identically — only AI accuracy differs.
          </p>
        </>
      )}

      {/* Confirmation dialog */}
      {showConfirm && estimate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {estimate.currentSetting.enabled ? 'Disable' : 'Enable'} Claude AI?
            </h3>
            <div className="text-sm text-gray-700 space-y-2">
              <p>You are about to {estimate.currentSetting.enabled ? 'disable' : 'enable'} Claude AI for ATO code proposals.</p>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Per import:</span>
                  <span className="font-medium">${estimate.estimates.perImport.cost.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monthly:</span>
                  <span className="font-medium">${estimate.estimates.monthly.cost.toFixed(2)}</span>
                </div>
                {estimate.estimates.backfill && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Backfill (one-time):</span>
                    <span className="font-medium">${estimate.estimates.backfill.cost.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={toggling}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={confirmToggle}
                disabled={toggling}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md disabled:opacity-50"
              >
                {toggling ? 'Saving…' : `Yes, ${estimate.currentSetting.enabled ? 'disable' : 'enable'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CostCell({
  label,
  sublabel,
  cost,
  highlight = false,
}: {
  label: string
  sublabel: string
  cost: number
  highlight?: boolean
}) {
  const fmt = cost < 1 ? `$${cost.toFixed(3)}` : `$${cost.toFixed(2)}`
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight ? 'border-purple-200 bg-purple-50' : 'border-border'
      }`}
    >
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5">{fmt}</p>
      <p className="text-[10px] text-muted-foreground">{sublabel}</p>
    </div>
  )
}
