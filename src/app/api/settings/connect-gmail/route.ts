import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { gmailAccounts, accounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

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

  if (!googleAccount[0]?.access_token) {
    return NextResponse.json(
      { error: 'No Google OAuth tokens found. Please sign out and sign in again.' },
      { status: 400 }
    )
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
    // Update tokens (always refresh from Auth.js)
    await db.update(gmailAccounts).set({
      accessToken: googleAccount[0].access_token,
      refreshToken: googleAccount[0].refresh_token || undefined,
      tokenExpiry: googleAccount[0].expires_at
        ? new Date(googleAccount[0].expires_at * 1000)
        : null,
    }).where(eq(gmailAccounts.id, existing[0].id))
  } else {
    // Create new
    await db.insert(gmailAccounts).values({
      userId: session.user.id,
      email: session.user.email,
      accessToken: googleAccount[0].access_token,
      refreshToken: googleAccount[0].refresh_token,
      tokenExpiry: googleAccount[0].expires_at
        ? new Date(googleAccount[0].expires_at * 1000)
        : null,
    })
  }

  return NextResponse.json({ success: true })
}
