import { db } from '@/lib/db'
import { whatsappDigestSnapshots } from '@/lib/db/schema'
import { and, desc, eq, isNull } from 'drizzle-orm'

export type Position = { pos: number; emailId: string }

export type ActiveSnapshot = {
  id: string
  recipient: string
  sentAt: Date
  positions: Position[]
}

export async function persistSnapshot(args: {
  recipient: string
  positions: Position[]
  messageId: string | null
}): Promise<string> {
  const [row] = await db
    .insert(whatsappDigestSnapshots)
    .values({
      recipient: args.recipient,
      positions: JSON.stringify(args.positions),
      messageId: args.messageId,
    })
    .returning({ id: whatsappDigestSnapshots.id })
  return row.id
}

export async function getActiveSnapshotForPhone(
  recipient: string,
): Promise<ActiveSnapshot | null> {
  const rows = await db
    .select({
      id: whatsappDigestSnapshots.id,
      recipient: whatsappDigestSnapshots.recipient,
      sentAt: whatsappDigestSnapshots.sentAt,
      positions: whatsappDigestSnapshots.positions,
    })
    .from(whatsappDigestSnapshots)
    .where(
      and(
        eq(whatsappDigestSnapshots.recipient, recipient),
        isNull(whatsappDigestSnapshots.expiresAt),
      ),
    )
    .orderBy(desc(whatsappDigestSnapshots.sentAt))
    .limit(1)

  if (rows.length === 0) return null
  const row = rows[0]
  return {
    id: row.id,
    recipient: row.recipient,
    sentAt: row.sentAt,
    positions: JSON.parse(row.positions) as Position[],
  }
}

export async function expireSnapshotsForPhone(recipient: string): Promise<void> {
  await db
    .update(whatsappDigestSnapshots)
    .set({ expiresAt: new Date() })
    .where(
      and(
        eq(whatsappDigestSnapshots.recipient, recipient),
        isNull(whatsappDigestSnapshots.expiresAt),
      ),
    )
}
