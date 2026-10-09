import { db } from '@/lib/db'
import { gmailAccounts } from '@/lib/db/schema'
import { createGmailClient, describeErrorForLog } from '@/lib/gmail/client'
import { buildMimeMessage, toBase64Url, GmailScopeError } from '@/lib/email/mime'
import { renderDigestEmail } from '@/lib/email/digest-email'
import type { DigestItem, DigestStats } from '@/lib/whatsapp/digest-format'

/**
 * Sends the digest by email through the Gmail API, using the same stored grant the
 * scanner already uses. Deliberately not a new email provider — see DEC-1 in
 * docs/features/2026-10-10-digest-channel-email.md and the user-level standing rule
 * about raising shared messaging before wiring one.
 *
 * Requires `https://www.googleapis.com/auth/gmail.send` on the grant. Until someone
 * signs out, signs back in and uses Reconnect Gmail, the stored grant is
 * `gmail.readonly` and Gmail answers 403 — surfaced as GmailScopeError so the remedy
 * is in the message rather than buried in a stack trace.
 */

export type EmailDigestResult = {
  sent: number
  failed: number
  /** Set when nothing was attempted, e.g. no recipients or no connected account. */
  reason?: string
}

/**
 * Who receives the email digest.
 *
 * `DIGEST_EMAIL_RECIPIENTS` (comma-separated) when set, else the connected Gmail
 * account's own address — so the feature works on deploy with nothing configured.
 */
export function emailRecipients(accountEmail: string | null): string[] {
  const configured = (process.env.DIGEST_EMAIL_RECIPIENTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (configured.length > 0) return configured
  return accountEmail ? [accountEmail] : []
}

/** True when a Gmail API error is the missing-scope 403 rather than anything else. */
function isScopeError(err: unknown): boolean {
  const e = err as { code?: number; status?: number; errors?: { reason?: string }[] }
  const status = e?.code ?? e?.status
  if (status !== 403) return false
  const reasons = (e?.errors ?? []).map((x) => x.reason)
  // Gmail uses both of these for "the token is valid but not for this".
  return reasons.some((r) => r === 'insufficientPermissions' || r === 'forbidden') || reasons.length === 0
}

export async function sendDigestEmail(
  items: DigestItem[],
  opts: { dateLabel: string; stats: DigestStats },
): Promise<EmailDigestResult> {
  const [account] = await db.select().from(gmailAccounts).limit(1)
  if (!account?.accessToken) {
    return { sent: 0, failed: 0, reason: 'no connected Gmail account to send from' }
  }

  const recipients = emailRecipients(account.email)
  if (recipients.length === 0) {
    return { sent: 0, failed: 0, reason: 'no email recipients configured' }
  }

  const { subject, text, html } = renderDigestEmail(items, opts)
  const raw = toBase64Url(
    buildMimeMessage({ to: recipients, from: account.email, subject, text, html }),
  )

  try {
    const { gmail } = await createGmailClient({
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      tokenExpiry: account.tokenExpiry,
    })
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
    return { sent: recipients.length, failed: 0 }
  } catch (err) {
    if (isScopeError(err)) {
      const scopeErr = new GmailScopeError()
      console.error('[digest-email]', scopeErr.message)
      return { sent: 0, failed: recipients.length, reason: scopeErr.message }
    }
    // describeErrorForLog: the raw gaxios error carries the refresh token and client
    // secret, and Vercel logs are not the place for either.
    const summary = describeErrorForLog(err)
    console.error('[digest-email] send failed:', summary)
    return { sent: 0, failed: recipients.length, reason: summary }
  }
}
