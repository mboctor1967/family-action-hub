import { db } from '@/lib/db'
import { gmailAccounts } from '@/lib/db/schema'
import { runScanForAccount, type ScanResult } from '@/lib/scan/run-scan'
import { classifyScanError } from '@/lib/scan/scan-errors'
import { sendDigest } from '@/lib/whatsapp/digest-sender'
import { sendOpsAlert, type ScanFailureReport } from '@/lib/whatsapp/ops-alert'
import { sendTemplate } from '@/lib/whatsapp/client'
import { loadDigestItems, digestCutoff } from '@/lib/whatsapp/digest-items'
import { getSetting, setSetting } from '@/lib/app-settings'
import type { DigestStats } from '@/lib/whatsapp/digest-format'
import { APP_LOCALE, APP_TIMEZONE } from '@/lib/constants'

/**
 * The daily digest pipeline, shared by the cron and the "Send digest now" button.
 *
 * Delivery is two-step because of Meta's 24-hour customer-service window: free-form
 * text is only delivered within 24h of the recipient's last message to the bot. The
 * digest used to be pushed as free-form text, so it arrived only on days after
 * someone had replied — "works 1–2 times, then stops". Now a pre-approved template
 * (always deliverable) announces the digest; tapping its "Show digest" button is an
 * inbound message, which opens the window for the full free-form digest.
 */

/** Quick-reply payload on the digest template's button; the webhook routes on it. */
export const DIGEST_BUTTON_PAYLOAD = 'SHOW_DIGEST'

/** app_settings key holding the last run's stats, so the tapped digest shows the same numbers. */
export const LAST_DIGEST_STATS_KEY = 'whatsapp_last_digest_stats'

export type DailyDigestResult = {
  sent: number
  failed: number
  skipped: number
  scanErrors?: number
  suppressed?: boolean
  reason?: string
}

const dateFmt = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: 'short',
  day: '2-digit',
})
const shortFmt = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIMEZONE,
  month: 'short',
  day: '2-digit',
})

export function digestRecipients(): string[] {
  return (process.env.WHATSAPP_ALLOWED_NUMBERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function runDailyDigest(): Promise<DailyDigestResult> {
  // Recipients come from the WhatsApp allowlist (E.164 format, including +).
  const recipients = digestRecipients()
  if (recipients.length === 0) {
    return { sent: 0, failed: 0, skipped: 1, reason: 'no recipients' }
  }

  // Run one fresh scan per Gmail account (recipients share the scanned mailbox).
  const accounts = await db.select().from(gmailAccounts)
  const scanResults: ScanResult[] = []
  const failures: ScanFailureReport[] = []
  for (const account of accounts) {
    try {
      scanResults.push(await runScanForAccount(account.id))
    } catch (err) {
      const classified = classifyScanError(err)
      // Log the classified message only: the raw gaxios error carries the refresh
      // token in its request body. AC-006.
      console.error(`[daily-digest] scan failed for account ${account.id} (${classified.code}): ${classified.message}`)
      failures.push({
        email: account.email,
        errorCode: classified.code,
        errorMessage: classified.message,
        // Read before the scan wrote its error fields, so this is the genuine
        // last-success timestamp rather than this run's failure time.
        lastSuccessfulScan: account.lastScanAt,
      })
    }
  }
  const scanErrors = failures.length

  if (failures.length > 0) {
    await sendOpsAlert(failures)
  }

  // A failed scan must never produce a normal-looking digest: an empty digest is
  // indistinguishable from a quiet inbox. When nothing scanned, send nothing — the
  // operator has been alerted instead.
  if (accounts.length > 0 && scanResults.length === 0) {
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      scanErrors,
      suppressed: true,
      reason: 'scan failed for every account — digest suppressed',
    }
  }

  const items = await loadDigestItems()
  const stats = buildStats(scanResults, items.length, failures.length > 0)
  const dateLabel = dateFmt.format(new Date())

  try {
    await setSetting(LAST_DIGEST_STATS_KEY, stats)
  } catch (err) {
    console.error('[daily-digest] failed to store digest stats', err instanceof Error ? err.message : err)
  }

  const template = process.env.WHATSAPP_TEMPLATE_DIGEST?.trim()

  let sent = 0
  let failed = 0
  for (const recipient of recipients) {
    try {
      if (template) {
        await sendTemplate({
          to: recipient,
          name: template,
          bodyParams: [dateLabel, String(items.length)],
          quickReplyPayload: DIGEST_BUTTON_PAYLOAD,
          kind: 'digest_notice',
        })
      } else {
        // No approved template configured yet: the old free-form path. Delivered
        // only inside the 24h window — kept so a deploy before approval is no worse.
        await sendDigest({ recipient, items, dateLabel, stats })
      }
      sent++
    } catch (err) {
      console.error('[daily-digest] send failed for', recipient, err instanceof Error ? err.message : err)
      failed++
    }
  }

  return { sent, failed, skipped: 0, scanErrors, suppressed: false }
}

/** Full digest, sent when a recipient taps "Show digest" — i.e. inside the 24h window. */
export async function sendFullDigest(recipient: string): Promise<void> {
  const items = await loadDigestItems()
  const stored = await getSetting<DigestStats>(LAST_DIGEST_STATS_KEY).catch(() => null)
  const stats: DigestStats = stored
    ? { ...stored, actionableCount: items.length }
    : buildStats([], items.length, false)
  await sendDigest({ recipient, items, dateLabel: dateFmt.format(new Date()), stats })
}

function buildStats(scanResults: ScanResult[], actionableCount: number, scanFailed: boolean): DigestStats {
  const earliestFrom = scanResults.reduce<Date | null>(
    (acc, r) => (acc === null || r.windowFrom < acc ? r.windowFrom : acc),
    null,
  )
  const latestTo = scanResults.reduce<Date | null>(
    (acc, r) => (acc === null || r.windowTo > acc ? r.windowTo : acc),
    null,
  )
  return {
    windowFromLabel: shortFmt.format(earliestFrom ?? digestCutoff()),
    windowToLabel: shortFmt.format(latestTo ?? new Date()),
    totalEmails: scanResults.reduce((s, r) => s + r.totalEmails, 0),
    newEmails: scanResults.reduce((s, r) => s + r.newEmails, 0),
    alreadyScanned: scanResults.reduce((s, r) => s + r.alreadyScanned, 0),
    actionableCount,
    // At least one scan succeeded to get here; this marks a PARTIAL failure.
    scanFailed,
  }
}
