/**
 * RFC 2045 message construction for the Gmail API.
 *
 * Kept free of any database or network import so it can be unit-tested directly —
 * `@/lib/db` calls `neon()` at module scope and throws without DATABASE_URL.
 */

export type MimeArgs = {
  to: string[]
  from: string
  subject: string
  /** The plain-text alternative. Never markdown — no mail client renders it. */
  text: string
  /** The HTML alternative. Inline styles only; Gmail strips `<style>` blocks. */
  html: string
}

/** Thrown when Gmail refuses the send because the grant lacks `gmail.send`. */
export class GmailScopeError extends Error {
  constructor() {
    super(
      'Gmail refused the send: the stored grant does not include '
      + 'https://www.googleapis.com/auth/gmail.send. Sign out and back in, then use '
      + 'Reconnect Gmail in Settings so the widened grant reaches gmail_accounts.',
    )
    this.name = 'GmailScopeError'
  }
}

/**
 * Encode a header value only when it needs it.
 *
 * A raw non-ASCII byte in a header is not valid and gets mangled somewhere between
 * here and the recipient — the digest subject carries an em dash, so this is not
 * hypothetical.
 */
function encodeHeader(value: string): string {
  if (!/[^ -~]/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

/**
 * Build a `multipart/alternative` message: plain text first, HTML second.
 *
 * Order is load-bearing — multipart/alternative means "these are the same content,
 * use the last one you understand", so the least capable part goes first.
 */
export function buildMimeMessage({ to, from, subject, text, html }: MimeArgs): string {
  const boundary = `=_fah_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

  return [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

/** Gmail's `users.messages.send` wants base64url, unpadded. */
export function toBase64Url(raw: string): string {
  return Buffer.from(raw, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
