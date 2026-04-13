'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { Scan, Loader2, CheckCircle2, AlertTriangle, Mail, Filter, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface ScanProgress {
  step: number
  total: number
  label: string
  percent: number
}

interface TriageItem {
  id: string
  subject: string | null
  fromAddress: string | null
  fromName: string | null
  date: string | null
  aiSummary: string | null
  triageStatus: string | null
  messageId: string
  aiSuggestions: {
    urgency: string
    suggested_assignee: string | null
    suggested_topic: string | null
    due_date: string | null
    action_summary: string | null
  } | null
}

interface Member {
  id: string
  name: string
}

interface Topic {
  id: string
  name: string
}

export default function ScanPage() {
  const { data: session } = useSession()
  const [scanning, setScanning] = useState(false)
  const [scanWindow, setScanWindow] = useState('7d')
  const [result, setResult] = useState<any>(null)
  const [gmailAccount, setGmailAccount] = useState<any>(null)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [forceRescan, setForceRescan] = useState(false)

  // Triage state
  const [triageItems, setTriageItems] = useState<TriageItem[]>([])
  const [triageFilter, setTriageFilter] = useState('unreviewed')
  const [triageLoading, setTriageLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [topicsList, setTopicsList] = useState<Topic[]>([])
  const [editForm, setEditForm] = useState<{
    title: string
    priority: string
    assigneeId: string
    topicId: string
  }>({ title: '', priority: 'medium', assigneeId: '', topicId: '' })
  const [triaging, setTriaging] = useState<string | null>(null)

  useEffect(() => {
    loadGmailAccount()
  }, [session])

  // Load triage items on mount and when filter changes
  const loadTriageItems = useCallback(async () => {
    setTriageLoading(true)
    try {
      const res = await fetch(`/api/scan/triage?status=${triageFilter}`)
      if (res.ok) {
        setTriageItems(await res.json())
      }
    } catch {
      // Ignore
    } finally {
      setTriageLoading(false)
    }
  }, [triageFilter])

  useEffect(() => {
    if (session?.user) {
      loadTriageItems()
    }
  }, [session, triageFilter, loadTriageItems])

  // Load members and topics for the inline edit form
  useEffect(() => {
    if (!session?.user) return
    Promise.all([fetch('/api/members'), fetch('/api/topics')])
      .then(async ([mRes, tRes]) => {
        if (mRes.ok) setMembers(await mRes.json())
        if (tRes.ok) setTopicsList(await tRes.json())
      })
      .catch(() => {})
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
                toast(data.message, { icon: '\u2139\uFE0F' })
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
      // Reload triage items after scan
      loadTriageItems()
    }
  }

  function handleExpand(item: TriageItem) {
    if (expandedId === item.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(item.id)
    // Pre-fill edit form from AI suggestions
    const suggestions = item.aiSuggestions
    const matchedMember = suggestions?.suggested_assignee
      ? members.find(m => m.name.toLowerCase().includes(suggestions.suggested_assignee!.toLowerCase()))
      : null
    const matchedTopic = suggestions?.suggested_topic
      ? topicsList.find(t => t.name.toLowerCase() === suggestions.suggested_topic!.toLowerCase())
      : null

    setEditForm({
      title: item.subject || 'Untitled task',
      priority: suggestions?.urgency || 'medium',
      assigneeId: matchedMember?.id || '',
      topicId: matchedTopic?.id || '',
    })
  }

  async function handleConfirm(emailId: string) {
    setTriaging(emailId)
    try {
      const res = await fetch('/api/scan/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailId,
          action: 'confirm',
          edits: {
            title: editForm.title,
            priority: editForm.priority,
            assigneeId: editForm.assigneeId || undefined,
            topicId: editForm.topicId || undefined,
          },
        }),
      })
      if (res.ok) {
        toast.success('Task created')
        setExpandedId(null)
        loadTriageItems()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to confirm')
      }
    } catch {
      toast.error('Failed to confirm')
    } finally {
      setTriaging(null)
    }
  }

  async function handleReject(emailId: string) {
    setTriaging(emailId)
    try {
      const res = await fetch('/api/scan/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId, action: 'reject' }),
      })
      if (res.ok) {
        toast.success('Rejected — classifier updated')
        setExpandedId(null)
        loadTriageItems()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to reject')
      }
    } catch {
      toast.error('Failed to reject')
    } finally {
      setTriaging(null)
    }
  }

  const priorityColors: Record<string, string> = {
    urgent: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-blue-100 text-blue-700',
    low: 'bg-gray-100 text-gray-600',
  }

  const triageStatusColors: Record<string, string> = {
    unreviewed: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Email Scan" />

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

      {/* Scan results summary */}
      {result && !result.message && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Scan Complete
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

      {result && result.message && (
        <Card>
          <CardContent className="py-6">
            <div className="text-center">
              <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{result.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Triage section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Triage</CardTitle>
            <Select value={triageFilter} onValueChange={(v) => v && setTriageFilter(v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
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
              ? 'Confirm or reject proposed tasks from email scans'
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
                  ? 'No items to review. Run a scan to find actionable emails.'
                  : `No ${triageFilter} items.`}
              </p>
            </div>
          )}

          {!triageLoading && triageItems.length > 0 && (
            <div className="space-y-3">
              {triageItems.map((item) => (
                <div
                  key={item.id}
                  className="border rounded-lg p-4 space-y-3"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.subject || 'No subject'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.fromName || item.fromAddress}
                        {item.date && ` \u00B7 ${new Date(item.date).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.triageStatus && (
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

                  {/* AI summary */}
                  {item.aiSummary && (
                    <p className="text-xs text-muted-foreground">{item.aiSummary}</p>
                  )}

                  {/* Action buttons — only for unreviewed */}
                  {item.triageStatus === 'unreviewed' && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 hover:bg-green-50 hover:text-green-700"
                        onClick={() => handleExpand(item)}
                        disabled={triaging === item.id}
                      >
                        {expandedId === item.id ? (
                          <><ChevronUp className="mr-1 h-4 w-4" /> Close</>
                        ) : (
                          <><ThumbsUp className="mr-1 h-4 w-4" /> Confirm</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => handleReject(item.id)}
                        disabled={triaging === item.id}
                      >
                        {triaging === item.id ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <ThumbsDown className="mr-1 h-4 w-4" />
                        )}
                        Reject
                      </Button>
                      <a
                        href={`https://mail.google.com/mail/u/0/#all/${item.messageId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto"
                      >
                        <Button size="sm" variant="ghost" className="text-muted-foreground">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                  )}

                  {/* Inline edit form — expanded on confirm */}
                  {expandedId === item.id && item.triageStatus === 'unreviewed' && (
                    <div className="border-t pt-3 space-y-3">
                      <div>
                        <label className="text-xs font-medium">Title</label>
                        <Input
                          value={editForm.title}
                          onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-medium">Priority</label>
                          <Select value={editForm.priority} onValueChange={(v) => v && setEditForm(prev => ({ ...prev, priority: v }))}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="urgent">Urgent</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="low">Low</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs font-medium">Assignee</label>
                          <Select value={editForm.assigneeId} onValueChange={(v) => setEditForm(prev => ({ ...prev, assigneeId: v || '' }))}>
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {members.map((m) => (
                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs font-medium">Topic</label>
                          <Select value={editForm.topicId} onValueChange={(v) => setEditForm(prev => ({ ...prev, topicId: v || '' }))}>
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {topicsList.map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleConfirm(item.id)}
                        disabled={triaging === item.id || !editForm.title.trim()}
                        className="w-full"
                      >
                        {triaging === item.id ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating task...</>
                        ) : (
                          <><CheckCircle2 className="mr-2 h-4 w-4" /> Create Task</>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
