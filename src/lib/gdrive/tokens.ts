/**
 * Helper to fetch Google Drive OAuth tokens for a user.
 * Extracted from the ingest route pattern for reuse across Drive-consuming features.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { db } from '@/lib/db'
import { accounts } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export interface DriveToken {
  accessToken: string
  refreshToken?: string | null
  tokenExpiry?: Date | null
}

/**
 * Fetch the Google OAuth tokens for the given user.
 * Returns null if the user has no connected Google account.
 */
export async function getDriveTokenForUser(userId: string): Promise<DriveToken | null> {
  const rows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'google')))
    .limit(1)

  const account = rows[0]
  if (!account?.access_token) return null

  return {
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
    tokenExpiry: account.expires_at ? new Date(account.expires_at * 1000) : null,
  }
}
