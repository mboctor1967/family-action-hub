import { sendMessage } from '@/lib/whatsapp/client'
import { APP_LOCALE, APP_TIMEZONE } from '@/lib/constants'

/**
 * Operator alert for a failed Gmail scan.
 *
 * Goes to one recipient, never the whole allowlist: an OAuth failure is not
 * actionable by the rest of the family, and the family thread is not an ops
 * channel. See DEC-2 / AC-011.
 */

export type ScanFailureReport = {
  email: string
  errorCode: string | null
  errorMessage: string | null
  lastSuccessfulScan: Date | null
}

/** Ops recipient, falling back to the first allowlist entry so this is never unset by accident. */
export function resolveOpsRecipient(): string | null {
  const explicit = process.env.WHATSAPP_OPS_NUMBER?.trim()
  if (explicit) return explicit

  const first = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0]

  return first ?? null
}

const dateFmt = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export function formatOpsAlert(failures: ScanFailureReport[]): string {
  const lines: string[] = [
    '⚠️ *Gmail scan failed*',
    '',
    "Today's digest was not sent — an empty digest would look like a quiet inbox.",
    '',
  ]

  for (const f of failures) {
    lines.push(`*${f.email}*`)
    lines.push(`Error: ${f.errorCode ?? 'unknown'}`)
    lines.push(
      `Last successful scan: ${f.lastSuccessfulScan ? dateFmt.format(f.lastSuccessfulScan) : 'never'}`,
    )
    if (f.errorMessage) lines.push(f.errorMessage)
    lines.push('')
  }

  lines.push('Check Settings → Gmail Accounts, or run `npm run scan:health`.')
  return lines.join('\n')
}

/**
 * Best-effort: a failing alert must never take down the cron, which still has a
 * digest to send for any account that scanned successfully.
 * @returns whether the alert was delivered.
 */
export async function sendOpsAlert(failures: ScanFailureReport[]): Promise<boolean> {
  if (failures.length === 0) return false

  const recipient = resolveOpsRecipient()
  if (!recipient) {
    console.error('[ops-alert] scan failed but no ops recipient is configured')
    return false
  }

  try {
    await sendMessage({ to: recipient, body: formatOpsAlert(failures) })
    return true
  } catch (err) {
    console.error('[ops-alert] failed to deliver scan failure alert', err)
    return false
  }
}
