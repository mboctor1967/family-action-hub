'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Send, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

type Channel = 'whatsapp' | 'email' | 'both'

const OPTIONS: { value: Channel; label: string; hint: string }[] = [
  { value: 'both', label: 'Both', hint: 'WhatsApp and email' },
  { value: 'email', label: 'Email only', hint: 'Always delivers' },
  { value: 'whatsapp', label: 'WhatsApp only', hint: 'Needs an approved template' },
]

/**
 * Where the daily digest goes.
 *
 * Exists because WhatsApp delivered nothing between 4 and 10 October — Meta rejected
 * every send with 131047 (no approved template, outside the 24-hour window) and the
 * scan had been running perfectly the whole time. Email has no such window.
 */
export function DigestChannelCard() {
  const [channel, setChannel] = useState<Channel | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings/digest-channel')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { channel: Channel }) => setChannel(d.channel))
      .catch(() => toast.error('Could not load the digest channel'))
  }, [])

  async function choose(next: Channel) {
    if (next === channel || saving) return
    const previous = channel
    setChannel(next)          // optimistic — reverted below if the write fails
    setSaving(true)
    try {
      const res = await fetch('/api/settings/digest-channel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: next }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save')
      toast.success(`Digest channel set to ${OPTIONS.find((o) => o.value === next)?.label}`)
    } catch (err) {
      setChannel(previous)
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-4 w-4" />
          Digest delivery
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Where the daily Gmail digest is sent. Email always delivers; WhatsApp only
          delivers once an approved message template is configured.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {channel === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map((opt) => {
              const active = channel === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => choose(opt.value)}
                  disabled={saving}
                  aria-pressed={active}
                  className={
                    'rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60 '
                    + (active
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-200 text-muted-foreground hover:bg-muted/50')
                  }
                >
                  <span className="block font-medium">{opt.label}</span>
                  <span className={'block text-[11px] ' + (active ? 'text-blue-100' : 'text-muted-foreground')}>
                    {opt.hint}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
