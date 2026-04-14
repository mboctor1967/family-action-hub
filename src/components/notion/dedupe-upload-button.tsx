'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import toast from 'react-hot-toast'

export function DedupeUploadButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    try {
      const text = await f.text()
      let report: unknown
      try { report = JSON.parse(text) } catch { toast.error('Not valid JSON'); return }
      const res = await fetch('/api/notion/dedupe/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: f.name, report }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err?.error || `Upload failed (${res.status})`)
        return
      }
      const { id } = await res.json()
      router.push(`/notion/dedupe/${id}`)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" onChange={onPick} />
      <Button onClick={() => inputRef.current?.click()} disabled={busy} className="gap-1.5">
        <Upload className="h-4 w-4" />
        {busy ? 'Uploading…' : 'Upload report'}
      </Button>
    </>
  )
}
