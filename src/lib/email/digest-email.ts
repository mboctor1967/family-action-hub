import type { DigestItem, DigestStats } from '@/lib/whatsapp/digest-format'
import { APP_LOCALE, APP_TIMEZONE } from '@/lib/constants'

/**
 * The digest as an email.
 *
 * Carries the same items, links and window stats as the WhatsApp digest (AC-005) — the
 * channel is a delivery choice, not a content choice.
 *
 * Two rules from the user's standing email guidance, both load-bearing:
 *   - real HTML in the HTML part, a plain-text alternative alongside. Never markdown;
 *     no mail client renders it and the asterisks show.
 *   - inline styles only. Gmail strips <style> blocks, so a stylesheet silently does
 *     nothing and the mail arrives unstyled.
 *
 * The reply grammar from the WhatsApp digest is deliberately NOT reproduced: there is
 * no inbound email path, so "reply task 1,3" would be an instruction that does nothing.
 * The email links to /scan instead.
 */

export type RenderedEmail = { subject: string; text: string; html: string }

const SHORT_DATE_FMT = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIMEZONE,
  month: 'short',
  day: '2-digit',
})

/** Subjects and sender names come from arbitrary email; never interpolate them raw. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function gmailLink(item: DigestItem): string {
  return `https://mail.google.com/mail/u/0/#all/${item.gmailMessageId}`
}

function senderLabel(item: DigestItem): string {
  if (item.fromName && item.fromAddress) return `${item.fromName} <${item.fromAddress}>`
  return item.fromAddress || item.fromName || '(unknown sender)'
}

function statsLine(stats: DigestStats): string {
  const newVsSkipped = stats.alreadyScanned > 0
    ? `${stats.newEmails} new, ${stats.alreadyScanned} already scanned`
    : `${stats.newEmails} new`
  const suffix = stats.scanFailed ? ' — scan error, showing stored state' : ''
  return `Window ${stats.windowFromLabel} – ${stats.windowToLabel} · ${stats.totalEmails} emails `
    + `(${newVsSkipped}) · ${stats.actionableCount} actionable${suffix}`
}

function hubBaseUrl(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || 'family-action-hub.vercel.app'
  return `https://${host}`
}

export function renderDigestEmail(
  items: DigestItem[],
  opts: { dateLabel: string; stats: DigestStats },
): RenderedEmail {
  const { dateLabel, stats } = opts
  const scanUrl = `${hubBaseUrl()}/scan`
  const subject = items.length > 0
    ? `Gmail digest — ${dateLabel} — ${items.length} to review`
    : `Gmail digest — ${dateLabel} — nothing to action`

  const textBody = items.length > 0
    ? items.map((item, i) => {
      const datePrefix = item.date ? `${SHORT_DATE_FMT.format(item.date)} · ` : ''
      return `${i + 1}. ${item.subject || '(no subject)'}\n`
        + `   ${datePrefix}${senderLabel(item)}\n`
        + `   ${gmailLink(item)}`
    }).join('\n\n')
    : 'Nothing needs action today.'

  const text = [
    `Gmail digest — ${dateLabel}`,
    statsLine(stats),
    '',
    textBody,
    '',
    `Review and triage: ${scanUrl}`,
  ].join('\n')

  const itemsHtml = items.length > 0
    ? items.map((item, i) => {
      const datePrefix = item.date ? `${esc(SHORT_DATE_FMT.format(item.date))} &middot; ` : ''
      return `<tr>
  <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;vertical-align:top;">
    <div style="font:600 15px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#111827;">
      ${i + 1}. ${esc(item.subject || '(no subject)')}
    </div>
    <div style="font:400 13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#6b7280;margin-top:2px;">
      ${datePrefix}${esc(senderLabel(item))}
    </div>
    <a href="${esc(gmailLink(item))}"
       style="font:400 13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#2563eb;text-decoration:none;">
      Open in Gmail
    </a>
  </td>
</tr>`
    }).join('\n')
    : `<tr><td style="padding:16px 0;font:400 15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#6b7280;">
         Nothing needs action today.
       </td></tr>`

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f9fafb;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
         style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;">
    <tr>
      <td>
        <h1 style="margin:0;font:600 20px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#111827;">
          Gmail digest &mdash; ${esc(dateLabel)}
        </h1>
        <p style="margin:6px 0 0;font:400 13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#6b7280;">
          ${esc(statsLine(stats))}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-top:8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${itemsHtml}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding-top:20px;">
        <a href="${esc(scanUrl)}"
           style="display:inline-block;padding:10px 16px;border-radius:6px;background:#2563eb;color:#ffffff;
                  font:600 14px/1 -apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;">
          Review and triage
        </a>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}
