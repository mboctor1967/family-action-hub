/**
 * Scan failure taxonomy.
 *
 * Exists because the 2026-05 → 2026-08 outage was prolonged by an error message
 * that told the operator to reconnect Gmail when the actual fault was a rotated
 * OAuth client secret — advice that could never have worked. Each failure now
 * carries a machine-readable code and the remedy that actually applies.
 *
 * Brief: docs/features/2026-08-29-scan-reliability-fail-loud.md (DEC-4, AC-004/005)
 */

export type ScanErrorCode = 'invalid_client' | 'invalid_grant' | 'transient' | 'unknown'

export interface ClassifiedScanError {
  /** Stored in gmail_accounts.last_error_code — UI and alerts branch on this. */
  code: ScanErrorCode
  /** Stored in gmail_accounts.last_error / scan_runs.error_message. Self-contained. */
  message: string
  /** Short actionable instruction, shown on its own in Settings. */
  remedy: string
}

const TRANSIENT_NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'])

const REMEDY = {
  invalid_client:
    'Create a new client secret in Google Cloud Console and update GOOGLE_CLIENT_SECRET in Vercel and .env.local. Reconnecting Gmail will not help.',
  invalid_grant: 'Reconnect the Gmail account in Settings to issue a new refresh token.',
  transient: 'No action needed — this should clear on the next run.',
  unknown: 'Check the scan logs and the Gmail connection in Settings.',
} as const satisfies Record<ScanErrorCode, string>

/** The subset of googleapis/gaxios error shape we actually read. */
type HttpErrorLike = {
  response?: { status?: number; data?: { error?: unknown } }
  status?: number
  code?: unknown
  message?: unknown
}

const asError = (err: unknown): HttpErrorLike => (err ?? {}) as HttpErrorLike

function readStatus(err: unknown): number | undefined {
  const e = asError(err)
  const status = e.response?.status ?? e.status
  return typeof status === 'number' ? status : undefined
}

function readOAuthError(err: unknown): string | undefined {
  const e = asError(err)
  const fromBody = e.response?.data?.error
  if (typeof fromBody === 'string') return fromBody
  // googleapis sometimes surfaces only the message, e.g. new Error('invalid_grant')
  const msg = typeof e.message === 'string' ? e.message : ''
  if (/invalid_client/i.test(msg)) return 'invalid_client'
  if (/invalid_grant/i.test(msg)) return 'invalid_grant'
  return undefined
}

function rawMessage(err: unknown): string {
  if (err === null || err === undefined) return 'Unknown error'
  if (err instanceof Error) return err.message || 'Unknown error'
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

/**
 * Map any thrown value to a stable code plus operator-facing text.
 * Never throws — a classifier that fails would re-hide the failure it exists to expose.
 */
export function classifyScanError(err: unknown): ClassifiedScanError {
  const oauthError = readOAuthError(err)

  if (oauthError === 'invalid_client') {
    return {
      code: 'invalid_client',
      message: `Gmail authentication failed: the OAuth client secret is no longer valid (invalid_client). ${REMEDY.invalid_client}`,
      remedy: REMEDY.invalid_client,
    }
  }

  if (oauthError === 'invalid_grant') {
    return {
      code: 'invalid_grant',
      message: `Gmail authentication failed: the refresh token was revoked or has expired (invalid_grant). ${REMEDY.invalid_grant}`,
      remedy: REMEDY.invalid_grant,
    }
  }

  const status = readStatus(err)
  const networkCode = asError(err).code
  const isTransientStatus = typeof status === 'number' && (status === 429 || status >= 500)
  const isTransientNetwork = typeof networkCode === 'string' && TRANSIENT_NETWORK_CODES.has(networkCode)

  if (isTransientStatus || isTransientNetwork) {
    return {
      code: 'transient',
      message: `Gmail scan hit a temporary failure (${status ?? networkCode}): ${rawMessage(err)}. ${REMEDY.transient}`,
      remedy: REMEDY.transient,
    }
  }

  return {
    code: 'unknown',
    message: `Gmail scan failed: ${rawMessage(err)}`,
    remedy: REMEDY.unknown,
  }
}
