import { db } from '@/lib/db'
import { whatsappOutboundMessages } from '@/lib/db/schema'
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm'

/**
 * Delivery log for outbound WhatsApp messages.
 *
 * Meta accepting a send (HTTP 200) is not delivery: a free-form message outside the
 * 24-hour customer-service window is accepted, then fails asynchronously and is
 * reported only through the `statuses` webhook. Recording every wamid here, and
 * updating it from that webhook, is what makes an undelivered digest visible.
 */

export type OutboundKind = 'digest_notice' | 'digest_full' | 'ops_alert' | 'reply'

export async function recordOutbound(row: { id: string; recipient: string; kind: OutboundKind }): Promise<void> {
  await db.insert(whatsappOutboundMessages).values(row).onConflictDoNothing()
}

export type StatusUpdate = {
  id: string
  status: string
  timestamp?: string // unix seconds, as Meta sends it
  errorCode?: number | null
  errorTitle?: string | null
}

// Meta does not guarantee callback order: a late `sent` can arrive after `delivered`.
// Updates only move forward through this ranking; `failed` replaces only states that
// were never confirmed delivered.
const STATUS_RANK = ['accepted', 'sent', 'delivered', 'read'] as const

export function allowedPriorStatuses(status: string): string[] {
  if (status === 'failed') return ['accepted', 'sent']
  const rank = STATUS_RANK.indexOf(status as (typeof STATUS_RANK)[number])
  return rank <= 0 ? [] : STATUS_RANK.slice(0, rank)
}

/**
 * Applies a `statuses` webhook callback. A callback for a wamid not yet recorded
 * (it can race the insert in `recordOutbound`) updates nothing and is dropped; the
 * next callback for the same message corrects it.
 */
export async function applyStatusUpdate(u: StatusUpdate): Promise<void> {
  const prior = allowedPriorStatuses(u.status)
  if (prior.length === 0) return

  const statusAt = u.timestamp ? new Date(Number(u.timestamp) * 1000) : new Date()
  await db.update(whatsappOutboundMessages).set({
    status: u.status,
    statusAt,
    ...(u.errorCode != null ? { errorCode: u.errorCode } : {}),
    ...(u.errorTitle ? { errorTitle: u.errorTitle } : {}),
  }).where(and(
    eq(whatsappOutboundMessages.id, u.id),
    inArray(whatsappOutboundMessages.status, prior),
  ))
}

export type RecipientHealth = {
  recipient: string
  lastDeliveredAt: string | null
  lastFailure: { at: string; code: number | null; title: string | null } | null
  /** Status of the most recent digest notice/full send, or null if none recorded. */
  lastDigestStatus: string | null
  needsAttention: boolean
}

/**
 * The latest delivered message, latest failure and latest digest status per
 * recipient. Needs attention when the most recent digest is not known to have
 * arrived (failed, or never confirmed) — silence is the failure mode this exists for.
 */
export async function getDeliveryHealth(recipients: string[]): Promise<RecipientHealth[]> {
  const out: RecipientHealth[] = []
  for (const recipient of recipients) {
    // Meta reports recipients without the leading '+'; rows are stored as sent.
    const ids = [recipient, recipient.replace(/^\+/, '')]
    const latest = (where: SQL | undefined) => db.select().from(whatsappOutboundMessages)
      .where(and(inArray(whatsappOutboundMessages.recipient, ids), where))
      .orderBy(desc(whatsappOutboundMessages.createdAt))
      .limit(1)
      .then((r) => r[0])

    // Three narrow lookups rather than one windowed scan, so a burst of replies can
    // never push the latest digest out of view.
    const digest = await latest(inArray(whatsappOutboundMessages.kind, ['digest_notice', 'digest_full']))
    const delivered = await latest(inArray(whatsappOutboundMessages.status, ['delivered', 'read']))
    const failure = await latest(eq(whatsappOutboundMessages.status, 'failed'))

    out.push({
      recipient,
      lastDeliveredAt: (delivered?.statusAt ?? delivered?.createdAt)?.toISOString() ?? null,
      lastFailure: failure
        ? { at: (failure.statusAt ?? failure.createdAt).toISOString(), code: failure.errorCode, title: failure.errorTitle }
        : null,
      lastDigestStatus: digest?.status ?? null,
      needsAttention: !digest
        || digest.status === 'failed'
        // Delivery receipts normally land within seconds; an hour unconfirmed is a drop.
        || (!['delivered', 'read'].includes(digest.status) && Date.now() - digest.createdAt.getTime() > 60 * 60 * 1000),
    })
  }
  return out
}
