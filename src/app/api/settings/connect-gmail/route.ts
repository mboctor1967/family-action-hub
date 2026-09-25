import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { gmailAccounts, accounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { createGmailClient, describeErrorForLog } from '@/lib/gmail/client'
import { classifyScanError } from '@/lib/scan/scan-errors'

const SIGN_IN_AGAIN =
  'Google rejected the saved Gmail login. Sign out of the hub, sign in again, then press Reconnect Gmail.'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get the Google OAuth tokens from the accounts table (stored by Auth.js)
  const googleAccount = await db.select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, session.user.id),
      eq(accounts.provider, 'google')
    ))
    .limit(1)

  const stored = googleAccount[0]
  if (!stored?.access_token || !stored.refresh_token) {
    return NextResponse.json(
      { error: 'No Google OAuth tokens found. Please sign out and sign in again.' },
      { status: 400 }
    )
  }

  // This button copies the token Auth.js saved at the last sign-in — it never goes
  // to Google. Pressed without a fresh sign-in it used to re-save a revoked token
  // and report success (2026-09-25). Prove the token works before saving it. AC-009.
  let accessToken = stored.access_token
  // null = unknown: the scanner refreshes on its first 401 (fetchEmails reactive retry).
  let tokenExpiry: Date | null = null
  try {
    const { newAccessToken } = await createGmailClient(
      { accessToken: stored.access_token, refreshToken: stored.refresh_token, tokenExpiry: null },
      true,
    )
    if (newAccessToken) {
      accessToken = newAccessToken
      tokenExpiry = new Date(Date.now() + 3600 * 1000)
    }
  } catch (err) {
    const classified = classifyScanError(err)
    console.error('[connect-gmail] token test failed:', describeErrorForLog(err))
    if (classified.code === 'invalid_grant') {
      return NextResponse.json({ error: SIGN_IN_AGAIN, code: classified.code }, { status: 409 })
    }
    if (classified.code === 'invalid_client') {
      return NextResponse.json({ error: classified.remedy, code: classified.code }, { status: 409 })
    }
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: 502 })
  }

  // Check if already connected
  const existing = await db.select({ id: gmailAccounts.id })
    .from(gmailAccounts)
    .where(and(
      eq(gmailAccounts.userId, session.user.id),
      eq(gmailAccounts.email, session.user.email)
    ))
    .limit(1)

  if (existing.length > 0) {
    await db.update(gmailAccounts).set({
      accessToken,
      refreshToken: stored.refresh_token,
      tokenExpiry,
    }).where(eq(gmailAccounts.id, existing[0].id))
  } else {
    await db.insert(gmailAccounts).values({
      userId: session.user.id,
      email: session.user.email,
      accessToken,
      refreshToken: stored.refresh_token,
      tokenExpiry,
    })
  }

  return NextResponse.json({ success: true })
}
