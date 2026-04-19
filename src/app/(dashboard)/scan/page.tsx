'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Scan, Loader2, CheckCircle2, AlertTriangle, Mail, Filter, ExternalLink, ArrowRight, Settings as SettingsIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface ScanProgress { step: number; total: number; label: string; percent: number }

interface TriageItem {
  id: string
  subject: string | null
  fromAddress: string | null
  fromName: string | null
  date: string | null
  aiSummary: string | null
  triageStatus: string | null
  messageId: string
  aiSuggestions: { urgency?: string } | null
}

export default function ScanPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [scanning, setScanning] = useState(false)
  const [scanWindow, setScanWindow] = useState('7d')
  const [forceRescan, setForceRescan] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [gmailAccount, setGmailAccount] = useState<any>(null)
  const [gmailTokenExpired, setGmailTokenExpired] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)

  const [triageItems, setTriageItems] = useState<TriageItem[]>([])
  const [triageFilter, setTriageFilter] = useState('unreviewed')
  const [triageLoading, setTriageLoading] = useState(false)

  const [tickedIds, setTickedIds] = useState<Set<string>>(new Set())
  const [committing, setCommitting] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

  const loadTriageItems = useCallback(async () => {
    setTriageLoading(true)
    try {
      const res = await fetch(`/api/scan/triage?status=${triageFilter}`)
      if (res.ok) {
        const items: TriageItem[] = await res.json()
        setTriageItems(items)
        if (triageFilter === 'unreviewed') {
          const initial = new Set(items.filter(i => i.aiSuggestions?.urgency).map(i => i.id))
          setTickedIds(initial)
        } else {
          setTickedIds(new Set())
        }
      }
    } finally {
      setTriageLoading(false)
    }
  }, [triageFilter])

  useEffect(() => { if (session?.user) loadTriageItems() }, [session, triageFilter, loadTriageItems])

  useEffect(() => {
    if (!session?.user) return
    fetch('/api/settings/gmail-accounts').then(r => r.ok ? r.json() : []).then(accts => {
      if (accts?.length) {
        const a = accts[0]
        setGmailAccount(a)
        if (a.tokenExpiry && new Date(a.tokenExpiry).getTime() < Date.now()) {
          setGmailTokenExpired(true)
        }
      }
    }).catch(() => {})
  }, [session])

  function toggleTick(id: string) {
    setTickedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function startScan() {
    if (!gmailAccount) { toast.error('No Gmail account connected. Go to Settings.'); return }
    setScanning(true)
    setResult(null)
    setProgress({ step: 0, total: 5, label: 'Starting scan...', percent: 0 })
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gmailAccountId: gmailAccount.id, scanWindow, forceRescan }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Scan failed' }))
        toast.error(err.error || 'Scan failed'); setScanning(false); setProgress(null); return
      }
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) { toast.error('Streaming not supported'); setScanning(false); return }
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7)
          else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            if (eventType === 'progress') setProgress(data)
            else if (eventType === 'done') {
              setResult(data)
              if (data.message) toast(data.message, { icon: '\u2139\uFE0F' })
              else toast.success(`Done! ${data.actionable} actionable, ${data.informational} info, ${data.noise} noise`)
            } else if (eventType === 'error') {
              toast.error(data.error)
              if (/gmail token|reconnect your gmail/i.test(data.error)) setGmailTokenExpired(true)
            }
          }
        }
      }
    } catch {
      toast.error('Scan failed. Check your connection.')
    } finally {
      setScanning(false)
      setProgress(null)
      loadTriageItems()
    }
  }

  const confirmCount = tickedIds.size
  const rejectCount = triageItems.filter(i => !tickedIds.has(i.id)).length

  function onCommitClick() {
    if (confirmCount === 0 && rejectCount > 0) { setConfirmDialogOpen(true); return }
    doCommit()
  }

  async function doCommit() {
    setCommitting(true)
    setConfirmDialogOpen(false)
    const confirmIds = Array.from(tickedIds)
    const rejectIds = triageItems.filter(i => !tickedIds.has(i.id)).map(i => i.id)
    try {
      const res = await fetch('/api/scan/triage/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmIds, rejectIds }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Commit failed')
        setCommitting(false)
        return
      }
      const { taskIds } = await res.json()
      toast.success(`${confirmIds.length} task${confirmIds.length !== 1 ? 's' : ''} created, ${rejectIds.length} rejected`)
      if (taskIds.length > 0) router.push(`/tasks?new=${taskIds.join(',')}`)
      else { setCommitting(false); loadTriageItems() }
    } catch {
      toast.error('Commit failed')
      setCommitting(false)
    }
  }

  const priorityColors: Record<string, string> = {
    urgent: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700',
    medium: 'bg-blue-100 text-blue-700', low: 'bg-gray-100 text-gray-600',
  }
  const triageStatusColors: Record<string, string> = {
    unreviewed: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }

  const showCommitFooter = triageFilter === 'unreviewed' && triageItems.length > 0

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Email Scan"
        action={
          <div className="flex items-center gap-4">
            <Link
              href="/settings"
              className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
            >
              <SettingsIcon className="h-4 w-4" />
              Settings
            </Link>
            <Link
              href="/tasks"
              className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
            >
              Tasks
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      {gmailTokenExpired && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-amber-900">Gmail access token expired</p>
            <p className="text-amber-800">Reconnect to resume scanning. The daily WhatsApp digest will use existing data until you reconnect.</p>
          </div>
          <Link href="/settings" className="shrink-0">
            <Button size="sm" variant="default">Reconnect Gmail</Button>
          </Link>
        </div>
      )}

      {/* Scan controls — unchanged from before */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan Gmail</CardTitle>
          <CardDescription>
            {gmailAccount ? `Connected: ${gmailAccount.email}` : 'No Gmail account connected'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Scan window</label>
            <Select value={scanWindow} onValueChange={(v) => v && setScanWindow(v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="force-rescan" checked={forceRescan}
              onCheckedChange={(c) => setForceRescan(c === true)} />
            <label htmlFor="force-rescan" className="text-sm text-muted-foreground cursor-pointer">
              Re-scan already processed emails
            </label>
          </div>
          {scanning && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{progress.label}</span>
                <span className="font-medium">{progress.percent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress.percent}%` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Step {progress.step} of {progress.total}</span>
              </div>
            </div>
          )}
          <Button onClick={startScan} disabled={scanning || !gmailAccount} className="w-full" size="lg">
            {scanning ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" />Scanning...</>)
              : (<><Scan className="mr-2 h-5 w-5" />Scan Now</>)}
          </Button>
          {!gmailAccount && (
            <p className="text-sm text-muted-foreground text-center">
              <Link href="/settings" className="text-blue-600 hover:underline">Connect your Gmail account</Link>{' '}
              to start scanning.
            </p>
          )}
        </CardContent>
      </Card>

      {result && !result.message && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />Scan Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Mail className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{result.emailsScanned}</p>
                <p className="text-xs text-muted-foreground">Emails scanned</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                <p className="text-2xl font-bold text-blue-600">{result.actionable}</p>
                <p className="text-xs text-muted-foreground">Needs review</p>
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
          </CardContent>
        </Card>
      )}

      {result?.message && (
        <Card><CardContent className="py-6"><div className="text-center">
          <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{result.message}</p>
        </div></CardContent></Card>
      )}

      {/* Triage */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Triage</CardTitle>
            <Select value={triageFilter} onValueChange={(v) => v && setTriageFilter(v)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unreviewed">Unreviewed</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CardDescription>
            {triageFilter === 'unreviewed'
              ? 'Tick the emails you want as tasks. Unticked rows will be marked rejected (classifier learns).'
              : `Showing ${triageFilter} items`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {triageLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!triageLoading && triageItems.length === 0 && (
            <div className="text-center py-8">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {triageFilter === 'unreviewed'
                  ? 'Nothing to review. Run a scan.' : `No ${triageFilter} items.`}
              </p>
            </div>
          )}
          {!triageLoading && triageItems.length > 0 && (
            <div className="space-y-2">
              {triageItems.map((item) => {
                const ticked = tickedIds.has(item.id)
                const editable = triageFilter === 'unreviewed'
                return (
                  <div key={item.id} className="border rounded-lg p-3 flex items-start gap-3">
                    {editable && (
                      <Checkbox
                        checked={ticked}
                        onCheckedChange={() => toggleTick(item.id)}
                        aria-label="Mark as task"
                        className="mt-0.5"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.subject || 'No subject'}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.fromName || item.fromAddress}
                            {item.date && ` \u00B7 ${new Date(item.date).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.triageStatus && !editable && (
                            <Badge className={triageStatusColors[item.triageStatus] || ''} variant="secondary">
                              {item.triageStatus}
                            </Badge>
                          )}
                          {item.aiSuggestions?.urgency && (
                            <Badge className={priorityColors[item.aiSuggestions.urgency] || ''} variant="secondary">
                              {item.aiSuggestions.urgency}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {item.aiSummary && (
                        <p className="text-xs text-muted-foreground mt-1">{item.aiSummary}</p>
                      )}
                    </div>
                    <a href={`https://mail.google.com/mail/u/0/#all/${item.messageId}`}
                       target="_blank" rel="noopener noreferrer"
                       className="text-muted-foreground hover:text-foreground mt-0.5"
                       aria-label="Open in Gmail">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky commit footer */}
      {showCommitFooter && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur p-3 z-30">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-medium">{confirmCount}</span>
              <span className="text-muted-foreground"> to create · </span>
              <span className="font-medium">{rejectCount}</span>
              <span className="text-muted-foreground"> to reject</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={loadTriageItems} disabled={committing}>Reset</Button>
              <Button onClick={onCommitClick} disabled={committing || triageItems.length === 0}>
                {committing ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Committing...</>)
                  : confirmCount > 0
                    ? (<>Create {confirmCount} task{confirmCount !== 1 ? 's' : ''} · Reject {rejectCount}</>)
                    : (<>Reject {rejectCount}</>)}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Zero-tick confirmation dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejectCount} emails?</DialogTitle>
            <DialogDescription>
              You haven&apos;t ticked any as tasks. All {rejectCount} emails will be marked rejected and the classifier will learn they&apos;re not actionable.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
            <Button onClick={doCommit}>Reject {rejectCount}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
