import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { gmailAccounts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { describeErrorForLog } from '@/lib/gmail/client'
import { classifyScanError } from '@/lib/scan/scan-errors'
import { validateRange, clampToNow } from '@/lib/scan/backfill'

/** Admin session plus the admin's Gmail account. */
export async function backfillGuard(): Promise<{ error: NextResponse } | { accountId: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if ((session.user as any).role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const [account] = await db.select({ id: gmailAccounts.id }).from(gmailAccounts)
    .where(eq(gmailAccounts.userId, session.user.id)).limit(1)
  if (!account) return { error: NextResponse.json({ error: 'No Gmail account connected' }, { status: 404 }) }
  return { accountId: account.id }
}

export function parseRange(fromRaw: unknown, toRaw: unknown): { error: NextResponse } | { from: Date; to: Date } {
  const from = new Date(String(fromRaw))
  const to = clampToNow(new Date(String(toRaw)))
  const invalid = validateRange(from, to)
  return invalid ? { error: NextResponse.json({ error: invalid }, { status: 400 }) } : { from, to }
}

/**
 * Gmail/AI failures must not escape the handler: Next would log the raw gaxios
 * error, request config and refresh token included. AC-006.
 */
export function backfillFailure(err: unknown): NextResponse {
  console.error('[scan/backfill] failed:', describeErrorForLog(err))
  return NextResponse.json({ error: classifyScanError(err).message }, { status: 502 })
}
