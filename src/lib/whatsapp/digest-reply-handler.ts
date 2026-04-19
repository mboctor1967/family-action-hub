import { db } from '@/lib/db'
import { confirmEmailAsTask, rejectEmail } from '@/lib/scan/triage-actions'
import { parseDigestReply } from './digest-reply-parser'
import { formatHelp, formatTriageResult, formatUnrecognised } from './digest-format'
import type { ActiveSnapshot } from './digest-snapshot'

export async function handleDigestReply(args: {
  phone: string
  text: string
  snapshot: ActiveSnapshot
  fallbackUserId: string
}): Promise<string> {
  const n = args.snapshot.positions.length
  const parsed = parseDigestReply(args.text, n)

  if (parsed === null) return formatUnrecognised()
  if (parsed.help) return formatHelp()

  const positionMap = new Map(args.snapshot.positions.map((p) => [p.pos, p.emailId]))

  let created = 0
  let rejected = 0
  let failed = 0

  for (const pos of parsed.confirm) {
    const emailId = positionMap.get(pos)
    if (!emailId) continue
    try {
      await confirmEmailAsTask(db as unknown as Parameters<typeof confirmEmailAsTask>[0], emailId, args.fallbackUserId)
      created++
    } catch (err) {
      console.error('[digest-reply] confirm failed', { pos, emailId, err })
      failed++
    }
  }

  for (const pos of parsed.reject) {
    const emailId = positionMap.get(pos)
    if (!emailId) continue
    try {
      await rejectEmail(db as unknown as Parameters<typeof rejectEmail>[0], emailId)
      rejected++
    } catch (err) {
      console.error('[digest-reply] reject failed', { pos, emailId, err })
      failed++
    }
  }

  return formatTriageResult({
    created,
    rejected,
    failed,
    outOfRange: parsed.outOfRange,
    conflicts: parsed.conflicts,
  })
}
