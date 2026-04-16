'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import toast from 'react-hot-toast'

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading'; pct: number; msg: string }
  | { kind: 'parsing'; pct: number; msg: string }
  | { kind: 'uploading'; pct: number; msg: string }
  | { kind: 'server'; pct: number; msg: string }
  | { kind: 'done'; pct: number; msg: string }
  | { kind: 'error'; msg: string }

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export function DedupeUploadButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const busy = phase.kind !== 'idle' && phase.kind !== 'error'
  const router = useRouter()

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return

    try {
      setPhase({
        kind: 'reading',
        pct: 5,
        msg: `Reading ${f.name} (${fmtBytes(f.size)}) from disk…`,
      })
      const text = await f.text()

      setPhase({
        kind: 'parsing',
        pct: 15,
        msg: `Parsing ${fmtBytes(text.length)} of JSON in the browser…`,
      })
      // Yield to the event loop so the progress bar can paint before JSON.parse blocks.
      await new Promise((r) => setTimeout(r, 30))
      let report: unknown
      try {
        report = JSON.parse(text)
      } catch {
        setPhase({ kind: 'error', msg: 'File is not valid JSON.' })
        toast.error('Not valid JSON')
        return
      }

      const clusterCount = Array.isArray(report) ? (report as unknown[]).length : 0
      setPhase({
        kind: 'parsing',
        pct: 25,
        msg: `Parsed ${clusterCount.toLocaleString()} clusters. Preparing request body…`,
      })
      await new Promise((r) => setTimeout(r, 0))
      const body = JSON.stringify({ filename: f.name, report })
      const bodySize = new Blob([body]).size

      const { id } = await uploadWithProgress(body, bodySize, clusterCount, setPhase)

      setPhase({
        kind: 'done',
        pct: 100,
        msg: `Saved. Redirecting to review page…`,
      })
      router.push(`/notion/dedupe/${id}`)
    } catch (err: any) {
      const msg = err?.message || 'Upload failed'
      setPhase({ kind: 'error', msg })
      toast.error(msg)
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onPick}
      />
      <Button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="gap-1.5"
      >
        <Upload className="h-4 w-4" />
        {busy ? 'Uploading…' : 'Upload report'}
      </Button>

      {phase.kind !== 'idle' && (
        <div className="max-w-xl rounded-lg border bg-gray-50 p-3 space-y-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full transition-all duration-200 ${
                phase.kind === 'error' ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{
                width: `${phase.kind === 'error' ? 100 : (phase as any).pct ?? 0}%`,
              }}
            />
          </div>
          <p className="text-xs text-gray-600 font-mono leading-relaxed">
            {phase.kind !== 'error' && (
              <span className="text-gray-400 mr-1">[{(phase as any).pct}%]</span>
            )}
            <span className="text-gray-500 mr-1">
              {phase.kind === 'error' ? 'error:' : `${phase.kind}:`}
            </span>
            {phase.msg}
          </p>
        </div>
      )}
    </div>
  )
}

function uploadWithProgress(
  body: string,
  bodySize: number,
  clusterCount: number,
  setPhase: (p: Phase) => void,
): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/notion/dedupe/upload')
    xhr.setRequestHeader('Content-Type', 'application/json')

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return
      const frac = e.loaded / e.total
      // Map upload progress to 30–75% of the overall bar.
      const pct = 30 + Math.round(frac * 45)
      setPhase({
        kind: 'uploading',
        pct,
        msg: `Uploading ${fmtBytes(e.loaded)} of ${fmtBytes(e.total)} (${Math.round(frac * 100)}%)…`,
      })
    }

    xhr.upload.onload = () => {
      setPhase({
        kind: 'server',
        pct: 80,
        msg: `Upload complete (${fmtBytes(bodySize)}). Server is validating ${clusterCount.toLocaleString()} clusters and writing to Postgres…`,
      })
    }

    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.ontimeout = () => reject(new Error('Upload timed out'))

    xhr.onload = () => {
      const ct = xhr.getResponseHeader('content-type') || ''
      const snippet = (xhr.responseText || '').slice(0, 200).replace(/\s+/g, ' ')
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          setPhase({
            kind: 'server',
            pct: 95,
            msg: `Server accepted report. Row id ${String(data.id).slice(0, 8)}…`,
          })
          resolve(data)
        } catch {
          reject(
            new Error(
              `Server returned status ${xhr.status} with non-JSON body (content-type: ${ct || 'none'}). First 200 chars: ${snippet}`,
            ),
          )
        }
      } else {
        let errMsg = `Upload failed (status ${xhr.status}, content-type: ${ct || 'none'}). First 200 chars: ${snippet}`
        try {
          const err = JSON.parse(xhr.responseText)
          if (err?.error) errMsg = `Upload failed (${xhr.status}): ${err.error}`
        } catch {}
        reject(new Error(errMsg))
      }
    }

    setPhase({
      kind: 'uploading',
      pct: 30,
      msg: `Opening connection and sending ${fmtBytes(bodySize)} to /api/notion/dedupe/upload…`,
    })
    xhr.send(body)
  })
}
