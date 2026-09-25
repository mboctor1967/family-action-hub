'use client'

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { History, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Estimate = {
  totalInWindow: number
  unscanned: number
  estCostUsd: number
  chunks: number
  truncated: boolean
  pricing: { model: string; asOf: string }
}

const isoDay = (d: Date) => d.toLocaleDateString('en-CA') // YYYY-MM-DD in local time
/** Local midnight as an instant — the browser is in Sydney, so this is Sydney midnight. */
const startOfDay = (day: string) => new Date(`${day}T00:00:00`).toISOString()

/**
 * Backfill of emails missed during an outage (AC-010).
 *
 * The estimate is free (Gmail ids only). Nothing that costs money runs until the
 * admin presses the button that states the cost — the AI cost transparency rule.
 */
export function MissedEmailsCard() {
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 21 * 86_400_000)))
  const [to, setTo] = useState(() => isoDay(new Date(Date.now() + 86_400_000)))
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [checking, setChecking] = useState(false)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const cancelled = useRef(false)
  const runningRef = useRef(false)
  // The end of the range is fixed when the estimate is made, so a run never pays
  // for more mail than the button stated.
  const [frozenTo, setFrozenTo] = useState<string | null>(null)

  // Leaving the page must stop the paid loop rather than let it run on unseen.
  useEffect(() => () => { cancelled.current = true }, [])

  const range = () => ({ from: startOfDay(from), to: startOfDay(to) })

  async function check() {
    setChecking(true)
    setEstimate(null)
    try {
      const r = range()
      const end = new Date(Math.min(new Date(r.to).getTime(), Date.now())).toISOString()
      const res = await fetch(`/api/scan/backfill/estimate?${new URLSearchParams({ from: r.from, to: end })}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) toast.error(data.error || 'Could not check for missed emails')
      else { setEstimate(data); setFrozenTo(end) }
    } catch {
      toast.error('Could not reach the hub. Check your connection.')
    } finally {
      setChecking(false)
    }
  }

  async function run() {
    if (!estimate || !frozenTo || runningRef.current) return
    runningRef.current = true
    setRunning(true)
    setDone(0)
    cancelled.current = false
    let processed = 0
    let actionable = 0
    let lastRemaining = Infinity
    try {
      while (!cancelled.current) {
        const res = await fetch('/api/scan/backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: range().from, to: frozenTo }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(data.error || 'Backfill failed')
          break
        }
        const remaining = Number(data.remaining)
        processed += Number(data.processed) || 0
        actionable += Number(data.actionable) || 0
        setDone(processed)
        // Stop rather than pay again for the same emails if a chunk made no progress.
        if (data.stalled) {
          toast.error('Backfill stopped: the last batch could not be classified. Try again later.')
          break
        }
        if (!Number.isFinite(remaining) || remaining >= lastRemaining) {
          toast.error('Backfill stopped: no progress on the last batch. Try again later.')
          break
        }
        lastRemaining = remaining
        if (remaining === 0) {
          toast.success(`Scanned ${processed} missed emails — ${actionable} actionable`)
          break
        }
      }
    } catch {
      toast.error('Backfill interrupted: lost connection. Scanned emails are kept; run it again to continue.')
    } finally {
      runningRef.current = false
      setRunning(false)
      if (!cancelled.current) check()
    }
  }

  const total = estimate?.unscanned ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scan Missed Emails</CardTitle>
        <CardDescription>Catch up on emails that arrived while scanning was down</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">From</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => { setFrom(e.target.value); setEstimate(null) }}
              disabled={running}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">To (exclusive)</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => { setTo(e.target.value); setEstimate(null) }}
              disabled={running}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        <Button onClick={check} disabled={checking || running} variant="outline" className="w-full">
          {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <History className="mr-2 h-4 w-4" />}
          Check for missed emails (free)
        </Button>

        {estimate && (
          <div className="p-3 rounded-lg bg-muted/50 space-y-2">
            <p className="text-sm">
              <strong className="tabular-nums">{estimate.unscanned}</strong> of{' '}
              <span className="tabular-nums">{estimate.totalInWindow}</span> emails in this range were never scanned.
            </p>
            {estimate.truncated ? (
              <p className="text-xs text-amber-800">
                Too many emails to count in one go — choose a shorter range.
              </p>
            ) : estimate.unscanned > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Estimated AI cost: <strong>US${estimate.estCostUsd.toFixed(2)}</strong> ({estimate.pricing.model},
                  pricing as of {estimate.pricing.asOf}) · {estimate.chunks} batch{estimate.chunks === 1 ? '' : 'es'}
                </p>
                {running ? (
                  <div className="space-y-2">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${Math.min(100, (done / Math.max(total, 1)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground tabular-nums">{done} / {total}</span>
                      <Button size="sm" variant="ghost" onClick={() => { cancelled.current = true }}>
                        Stop after this batch
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={run} className="w-full">
                    Scan {estimate.unscanned} emails (≈ US${estimate.estCostUsd.toFixed(2)})
                  </Button>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Nothing to catch up on.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
