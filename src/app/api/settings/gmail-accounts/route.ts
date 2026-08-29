import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { gmailAccounts } from '@/lib/db/schema'

/**
 * A daily digest that has not scanned successfully within this window is broken,
 * whatever the error columns say. Two days allows for one missed nightly run.
 */
const STALE_AFTER_MS = 48 * 60 * 60 * 1000

export type GmailHealth = 'healthy' | 'needs_attention'

/**
 * Derived server-side so the Settings card, the API and `npm run scan:health`
 * cannot disagree about what healthy means.
 *
 * Crucially this is NOT just "no recorded error". An account with null error
 * columns may simply never have had a failure written down — which is exactly
 * how a four-month outage displayed as a green "Connected" badge.
 */
function deriveHealth(account: {
  lastScanAt: Date | null
  lastError: string | null
  lastErrorCode: string | null
}): { health: GmailHealth; healthReason: string | null } {
  if (account.lastErrorCode) {
    return { health: 'needs_attention', healthReason: account.lastError ?? account.lastErrorCode }
  }

  if (!account.lastScanAt) {
    return { health: 'needs_attention', healthReason: 'This account has never completed a scan.' }
  }

  const age = Date.now() - new Date(account.lastScanAt).getTime()
  if (age > STALE_AFTER_MS) {
    const days = Math.floor(age / 86_400_000)
    return {
      health: 'needs_attention',
      healthReason: `No successful scan in ${days} day${days === 1 ? '' : 's'} — the digest runs daily.`,
    }
  }

  return { health: 'healthy', healthReason: null }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await db.select({
    id: gmailAccounts.id,
    email: gmailAccounts.email,
    lastScanAt: gmailAccounts.lastScanAt,
    lastError: gmailAccounts.lastError,
    lastErrorCode: gmailAccounts.lastErrorCode,
    lastErrorAt: gmailAccounts.lastErrorAt,
  }).from(gmailAccounts)

  return NextResponse.json(accounts.map((a) => ({ ...a, ...deriveHealth(a) })))
}
