'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { Mail, CheckCircle2, Plus, Scan, ArrowRight, AlertTriangle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { AiCostPanel } from '@/components/settings/ai-cost-panel'
import { WhatsAppDeliveryCard } from '@/components/settings/whatsapp-delivery-card'
import { MissedEmailsCard } from '@/components/settings/missed-emails-card'

/** Relative age of the last successful scan — "never" is a first-class answer. */
function formatLastScan(value: string | null): string {
  if (!value) return 'never'
  const ms = Date.now() - new Date(value).getTime()
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'less than an hour ago'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const [gmailAccounts, setGmailAccounts] = useState<any[]>([])

  useEffect(() => {
    loadAccounts()
  }, [])

  async function loadAccounts() {
    const res = await fetch('/api/settings/gmail-accounts')
    if (res.ok) {
      const data = await res.json()
      setGmailAccounts(data)
    }
  }

  async function connectGmail() {
    const res = await fetch('/api/settings/connect-gmail', { method: 'POST' })
    if (res.ok) {
      toast.success('Gmail account connected!')
      loadAccounts()
    } else {
      const data = await res.json()
      toast.error(data.error || 'Failed to connect Gmail')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          {session?.user && (
            <div className="space-y-2">
              <p className="text-sm"><strong>Name:</strong> {session.user.name}</p>
              <p className="text-sm"><strong>Email:</strong> {session.user.email}</p>
              <p className="text-sm"><strong>Role:</strong> <Badge variant="outline">{(session.user as any).role || 'member'}</Badge></p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gmail Accounts</CardTitle>
          <CardDescription>Connect Gmail accounts to scan for actionable emails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {gmailAccounts.map((account: any) => {
            const needsAttention = account.health === 'needs_attention'
            return (
              <div
                key={account.id}
                className={`p-3 rounded-lg space-y-2 ${
                  needsAttention ? 'bg-amber-50 border border-amber-200' : 'bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{account.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {needsAttention ? (
                      <>
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <span className="text-xs font-medium text-amber-700">Needs attention</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-muted-foreground">Healthy</span>
                      </>
                    )}
                  </div>
                </div>

                {/* The signal that actually matters: when a scan last SUCCEEDED. */}
                <p className="text-xs text-muted-foreground">
                  Last successful scan: {formatLastScan(account.lastScanAt)}
                </p>

                {needsAttention && account.healthReason && (
                  <p className="text-xs text-amber-800 leading-relaxed">{account.healthReason}</p>
                )}

                {needsAttention && (
                  <Button onClick={connectGmail} variant="outline" size="sm" className="w-full">
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Reconnect Gmail
                  </Button>
                )}
              </div>
            )
          })}

          {gmailAccounts.length === 0 && (
            <p className="text-sm text-muted-foreground">No Gmail accounts connected yet.</p>
          )}

          <Button onClick={connectGmail} variant="outline" className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Connect Gmail Account
          </Button>
        </CardContent>
      </Card>

      {(session?.user as { role?: string } | undefined)?.role === 'admin' && (
        <>
          <WhatsAppDeliveryCard />
          {gmailAccounts.length > 0 && <MissedEmailsCard />}
        </>
      )}

      {/* Phase F1 — AI cost transparency panel */}
      {(session?.user as any)?.role === 'admin' && <AiCostPanel />}

      {/* Show prominent CTA when Gmail is connected */}
      {gmailAccounts.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              <Scan className="h-10 w-10 mx-auto text-blue-600" />
              <div>
                <h3 className="font-semibold text-blue-900">Ready to scan!</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Your Gmail is connected. Scan your emails to find actionable items.
                </p>
              </div>
              <Link href="/scan">
                <Button size="lg" className="w-full bg-blue-600 hover:bg-blue-700">
                  <Scan className="mr-2 h-5 w-5" />
                  Go to Email Scanner
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
