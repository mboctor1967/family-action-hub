import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emailsScanned, gmailAccounts } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { runScanForAccount } from '@/lib/scan/run-scan'
import { scoreEmail } from '@/lib/scan/priority-score'
import { sendDigest } from '@/lib/whatsapp/digest-sender'
import { sendMessage } from '@/lib/whatsapp/client'
import { APP_LOCALE, APP_TIMEZONE } from '@/lib/constants'
import { formatFailure } from '@/lib/whatsapp/digest-format'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Recipients come from the WhatsApp allowlist (E.164 format, including +).
  const rawRecipients = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (rawRecipients.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, skipped: 1, reason: 'no recipients' })
  }

  // Run one fresh scan per Gmail account (recipients share the scanned mailbox).
  const accounts = await db.select().from(gmailAccounts)
  let scanFailed = false
  for (const account of accounts) {
    try {
      await runScanForAccount(account.id)
    } catch (err) {
      console.error('[cron/digest] scan failed for account', account.id, err)
      scanFailed = true
    }
  }

  if (scanFailed) {
    let failed = 0
    for (const recipient of rawRecipients) {
      try {
        await sendMessage({ to: recipient, body: formatFailure() })
      } catch (err) {
        console.error('[cron/digest] failure notification send failed', recipient, err)
      }
      failed++
    }
    return NextResponse.json({ sent: 0, failed, skipped: 0 })
  }

  // Fetch actionable + unreviewed emails across all accounts.
  const items = await db
    .select({
      id: emailsScanned.id,
      messageId: emailsScanned.messageId,
      subject: emailsScanned.subject,
      fromName: emailsScanned.fromName,
      fromAddress: emailsScanned.fromAddress,
      date: emailsScanned.date,
      rawSnippet: emailsScanned.rawSnippet,
    })
    .from(emailsScanned)
    .where(
      and(
        eq(emailsScanned.classification, 'actionable'),
        eq(emailsScanned.triageStatus, 'unreviewed'),
      ),
    )

  const scored = items
    .map((e) => ({
      item: e,
      score: scoreEmail({ date: e.date, subject: e.subject, rawSnippet: e.rawSnippet }),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const ad = a.item.date?.getTime() ?? 0
      const bd = b.item.date?.getTime() ?? 0
      return bd - ad
    })

  const dateLabel = new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date())

  let sent = 0
  let failed = 0
  for (const recipient of rawRecipients) {
    try {
      await sendDigest({
        recipient,
        items: scored.map((s) => ({
          subject: s.item.subject,
          fromName: s.item.fromName,
          fromAddress: s.item.fromAddress,
          gmailMessageId: s.item.messageId,
        })),
        dateLabel,
      })
      sent++
    } catch (err) {
      console.error('[cron/digest] send failed for', recipient, err)
      failed++
    }
  }

  return NextResponse.json({ sent, failed, skipped: 0 })
}
