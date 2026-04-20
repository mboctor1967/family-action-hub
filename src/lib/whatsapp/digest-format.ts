export type DigestItem = {
  id: string                     // emails_scanned.id UUID — used for triage lookups
  subject: string | null
  fromName: string | null
  fromAddress: string | null
  gmailMessageId: string         // Gmail message id — used for deep-link URL
}

const HELP_GRAMMAR = `Reply:
• task 1,3       — create tasks
• task 1-5       — range
• task all       — every item
• reject 2,4     — dismiss
• reject rest    — dismiss non-tasked
• done           — reject all
• help           — show this + example`

const HELP_EXAMPLE = `Example:
  Digest shows 7 items.
  Reply: task 1,3,5
  Result: 3 tasks created; items 2,4,6,7 remain unreviewed.`

function formatFrom(item: DigestItem): string {
  if (item.fromName && item.fromAddress) return `From: ${item.fromName} <${item.fromAddress}>`
  if (item.fromAddress) return `From: ${item.fromAddress}`
  if (item.fromName) return `From: ${item.fromName}`
  return 'From: (unknown)'
}

function formatItem(item: DigestItem, position: number): string {
  const subject = item.subject || '(no subject)'
  const from = formatFrom(item)
  const link = `https://mail.google.com/mail/u/0/#all/${item.gmailMessageId}`
  return `${position}. ${subject}\n   ${from}\n   ${link}`
}

export function formatDigest(
  items: DigestItem[],
  opts: { dateLabel: string; overflowCount: number },
): string {
  const shownCount = items.length
  const header = `📬 Gmail digest — ${opts.dateLabel}\n${shownCount} actionable${opts.overflowCount > 0 ? ` (top ${shownCount})` : ' (showing all)'}`
  const body = items.map((item, i) => formatItem(item, i + 1)).join('\n\n')
  const overflow = opts.overflowCount > 0
    ? `\n\n+${opts.overflowCount} more — open /scan to review all.`
    : ''
  return `${header}\n\n${body}${overflow}\n\n${HELP_GRAMMAR}`
}

export function formatZeroItems(): string {
  return '✅ Inbox clear — 0 actionable emails.'
}

export function formatHelp(): string {
  return `${HELP_GRAMMAR}\n\n${HELP_EXAMPLE}`
}

export function formatUnrecognised(): string {
  return `Didn't catch that.\n\n${HELP_GRAMMAR}\n\n${HELP_EXAMPLE}`
}

export function formatFailure(): string {
  return '⚠️ Digest failed — scan error. Open /scan to review manually.'
}

export function formatNoSnapshot(): string {
  return 'ℹ️ No active digest for you. Wait for tomorrow\'s or open /scan.'
}

export function formatTriageResult(args: {
  created: number
  rejected: number
  failed: number
  outOfRange: number[]
  conflicts: number[]
}): string {
  const lines: string[] = [`✅ ${args.created} tasks created, ${args.rejected} rejected.`]
  if (args.failed > 0) lines.push(`⚠️ ${args.failed} failed — see /scan.`)
  if (args.outOfRange.length > 0) lines.push(`Ignored out-of-range: ${args.outOfRange.join(', ')}.`)
  if (args.conflicts.length > 0) {
    lines.push(`Position ${args.conflicts.join(', ')} in both task and reject — task won.`)
  }
  lines.push('Open /tasks to view.')
  return lines.join('\n')
}
