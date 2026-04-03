'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Scan, Loader2, CheckCircle2, AlertTriangle, Mail, Filter } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface ScanProgress {
  step: number
  total: number
  label: string
  percent: number
}

export default function ScanPage() {
  const { data: session } = useSession()
  const [scanning, setScanning] = useState(false)
  const [scanWindow, setScanWindow] = useState('7d')
  const [result, setResult] = useState<any>(null)
  const [gmailAccount, setGmailAccount] = useState<any>(null)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [forceRescan, setForceRescan] = useState(false)

  useEffect(() => {
    loadGmailAccount()
  }, [session])

  async function loadGmailAccount() {
    if (!session?.user) return
    try {
      const res = await fetch('/api/settings/gmail-accounts')
      if (res.ok) {
        const accounts = await res.json()
        if (accounts && accounts.length > 0) {
          setGmailAccount(accounts[0])
        }
      }
    } catch {
      // Ignore
    }
  }

  async function startScan() {
    if (!gmailAccount) {
      toast.error('No Gmail account connected. Go to Settings.')
      return
    }

    setScanning(true)
    setResult(null)
    setProgress({ step: 0, total: 5, label: 'Starting scan...', percent: 0 })

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gmailAccountId: gmailAccount.id,
          scanWindow,
          forceRescan,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Scan failed' }))
        toast.error(err.error || 'Scan failed')
        setScanning(false)
        setProgress(null)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        toast.error('Streaming not supported')
        setScanning(false)
        return
      }

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7)
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            if (eventType === 'progress') {
              setProgress(data)
            } else if (eventType === 'done') {
              setResult(data)
              if (data.message) {
                toast(data.message, { icon: 'ℹ️' })
              } else {
                toast.success(`Done! ${data.actionable} actionable, ${data.informational} info, ${data.noise} noise`)
              }
            } else if (eventType === 'error') {
              toast.error(data.error)
            }
          }
        }
      }
    } catch (err) {
      toast.error('Scan failed. Check your connection.')
    } finally {
      setScanning(false)
      setProgress(null)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Email Scan</h2>

      {/* Scan controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan Gmail</CardTitle>
          <CardDescription>
            {gmailAccount
              ? `Connected: ${gmailAccount.email}`
              : 'No Gmail account connected'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Scan window</label>
            <Select value={scanWindow} onValueChange={(v) => v && setScanWindow(v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="force-rescan"
              checked={forceRescan}
              onCheckedChange={(checked) => setForceRescan(checked === true)}
            />
            <label htmlFor="force-rescan" className="text-sm text-muted-foreground cursor-pointer">
              Re-scan already processed emails
            </label>
          </div>

          {/* Progress bar */}
          {scanning && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{progress.label}</span>
                <span className="font-medium">{progress.percent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Step {progress.step} of {progress.total}</span>
              </div>
            </div>
          )}

          <Button
            onClick={startScan}
            disabled={scanning || !gmailAccount}
            className="w-full"
            size="lg"
          >
            {scanning ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Scan className="mr-2 h-5 w-5" />
                Scan Now
              </>
            )}
          </Button>

          {!gmailAccount && (
            <p className="text-sm text-muted-foreground text-center">
              <Link href="/settings" className="text-blue-600 hover:underline">
                Connect your Gmail account
              </Link>{' '}
              to start scanning.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Scan results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Scan Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.message && (
              <div className="text-center py-4">
                <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{result.message}</p>
                {result.alreadyScanned > 0 && (
                  <Link href="/">
                    <Button className="mt-4" variant="outline" size="sm">
                      View existing tasks in Inbox
                    </Button>
                  </Link>
                )}
              </div>
            )}

            {!result.message && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <Mail className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{result.emailsScanned}</p>
                    <p className="text-xs text-muted-foreground">Emails scanned</p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                    <p className="text-2xl font-bold text-blue-600">{result.actionable}</p>
                    <p className="text-xs text-muted-foreground">Actionable</p>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold">{result.informational}</p>
                    <p className="text-xs text-muted-foreground">Informational</p>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <Filter className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{result.noise}</p>
                    <p className="text-xs text-muted-foreground">Filtered noise</p>
                  </div>
                </div>

                {result.actionable > 0 && (
                  <Link href="/">
                    <Button className="w-full mt-4" variant="outline">
                      View new tasks in Inbox
                    </Button>
                  </Link>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
