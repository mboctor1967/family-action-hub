'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { Mail, CheckCircle2, Plus, Scan, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { AiCostPanel } from '@/components/settings/ai-cost-panel'

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
          {gmailAccounts.map((account: any) => (
            <div key={account.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{account.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-xs text-muted-foreground">Connected</span>
              </div>
            </div>
          ))}

          {gmailAccounts.length === 0 && (
            <p className="text-sm text-muted-foreground">No Gmail accounts connected yet.</p>
          )}

          <Button onClick={connectGmail} variant="outline" className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Connect Gmail Account
          </Button>
        </CardContent>
      </Card>

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
