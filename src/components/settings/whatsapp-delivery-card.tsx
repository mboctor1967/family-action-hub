'use client'

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { MessageCircle, CheckCircle2, AlertTriangle, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type RecipientHealth = {
  recipient: string
  lastDeliveredAt: string | null
  lastFailure: { at: string; code: number | null; title: string | null } | null
  lastDigestStatus: string | null
  needsAttention: boolean
}

function formatAgo(value: string | null): string {
  if (!value) return 'never'
  const ms = Date.now() - new Date(value).getTime()
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'less than an hour ago'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** Last-4 only: the card is on screen, the number does not need to be. */
const maskPhone = (p: string) => `•••• ${p.replace(/\D/g, '').slice(-4)}`

/**
 * WhatsApp delivery health + "Send digest now" (AC-007, AC-008).
 *
 * Meta accepting a message is not delivery: outside the 24h window a message is
 * accepted and then silently dropped. This card shows what Meta reported back.
 */
export function WhatsAppDeliveryCard() {
  const [health, setHealth] = useState<RecipientHealth[] | null>(null)
  const [sending, setSending] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadHealth()
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current) }
  }, [])

  async function loadHealth() {
    try {
      const res = await fetch('/api/whatsapp/delivery-health')
      if (!res.ok) throw new Error(String(res.status))
      setHealth(await res.json())
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }

  async function sendNow() {
    setSending(true)
    try {
      const res = await fetch('/api/whatsapp/digest/send', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Digest send failed')
      } else if (data.suppressed) {
        toast.error('Gmail scan failed, so no digest was sent. See Gmail Accounts above.')
      } else if (data.failed > 0) {
        toast.error(`Sent ${data.sent}, failed ${data.failed}`)
      } else {
        toast.success(`Digest sent to ${data.sent} recipient${data.sent === 1 ? '' : 's'}`)
      }
    } catch {
      toast.error('Could not reach the hub. Check your connection.')
    } finally {
      setSending(false)
      // Delivery receipts arrive within seconds; refresh once they have had a chance.
      refreshTimer.current = setTimeout(loadHealth, 5000)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">WhatsApp Digest</CardTitle>
        <CardDescription>Delivery as reported by WhatsApp, per recipient</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {health === null && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}
        {loadError && <p className="text-sm text-amber-800">Could not load delivery status.</p>}
        {health?.length === 0 && (
          <p className="text-sm text-muted-foreground">No WhatsApp recipients configured.</p>
        )}

        {health?.map((r) => (
          <div
            key={r.recipient}
            className={`p-3 rounded-lg space-y-1.5 ${
              r.needsAttention ? 'bg-amber-50 border border-amber-200' : 'bg-muted/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm tabular-nums">{maskPhone(r.recipient)}</span>
              </div>
              {r.needsAttention ? (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-medium text-amber-700">Needs attention</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-muted-foreground">Delivering</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Last delivered: {formatAgo(r.lastDeliveredAt)}
              {r.lastDigestStatus && <> · last digest: {r.lastDigestStatus}</>}
            </p>
            {r.lastFailure && (
              <p className="text-xs text-amber-800 leading-relaxed">
                Last failure {formatAgo(r.lastFailure.at)}
                {r.lastFailure.code ? ` (code ${r.lastFailure.code})` : ''}
                {r.lastFailure.title ? `: ${r.lastFailure.title}` : ''}
              </p>
            )}
          </div>
        ))}

        <Button onClick={sendNow} disabled={sending} variant="outline" className="w-full">
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {sending ? 'Scanning and sending…' : 'Send digest now'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Runs a fresh Gmail scan first, exactly like the daily 6am digest.
        </p>
      </CardContent>
    </Card>
  )
}
