import { sendMessage, sendTemplate } from '@/lib/whatsapp/client'
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

  const template = process.env.WHATSAPP_TEMPLATE_OPS_ALERT?.trim()

  try {
    if (template) {
      // A template is the only message type Meta delivers outside the 24h window.
      // The free-form alert below was dropped for 20 straight days in Sep 2026
      // because nobody had messaged the bot — the one moment an alert matters.
      await sendTemplate({ to: recipient, name: template, bodyParams: opsAlertTemplateParams(failures), kind: 'ops_alert' })
    } else {
      await sendMessage({ to: recipient, body: formatOpsAlert(failures), kind: 'ops_alert' })
    }
    return true
  } catch (err) {
    console.error('[ops-alert] failed to deliver scan failure alert', err instanceof Error ? err.message : err)
    return false
  }
}

/** Body params for the `family_hub_scan_alert` template: error code(s), last successful scan, fix link. */
export function opsAlertTemplateParams(failures: ScanFailureReport[]): string[] {
  const codes = [...new Set(failures.map((f) => f.errorCode ?? 'unknown'))].join(', ')
  const lastSuccess = failures
    .map((f) => f.lastSuccessfulScan)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0]
  return [codes, lastSuccess ? dateFmt.format(lastSuccess) : 'never', `${hubBaseUrl()}/settings`]
}

function hubBaseUrl(): string {
  // Vercel system env var; the fallback keeps local runs and tests pointing at production.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || 'family-action-hub.vercel.app'
  return `https://${host}`
}
