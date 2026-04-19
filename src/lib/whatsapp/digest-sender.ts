import { sendMessage } from '@/lib/whatsapp/client'
import { formatDigest, formatZeroItems, type DigestItem } from './digest-format'
import { persistSnapshot, expireSnapshotsForPhone } from './digest-snapshot'

const MAX_ITEMS = 20

export async function sendDigest(args: {
  recipient: string
  items: DigestItem[]
  dateLabel: string
}): Promise<void> {
  await expireSnapshotsForPhone(args.recipient)

  if (args.items.length === 0) {
    await sendMessage({ to: args.recipient, body: formatZeroItems() })
    return
  }

  const shown = args.items.slice(0, MAX_ITEMS)
  const overflowCount = Math.max(0, args.items.length - MAX_ITEMS)
  const body = formatDigest(shown, { dateLabel: args.dateLabel, overflowCount })

  await sendMessage({ to: args.recipient, body })

  const positions = shown.map((item, i) => ({ pos: i + 1, emailId: item.gmailMessageId }))
  await persistSnapshot({ recipient: args.recipient, positions, messageId: null })
}
