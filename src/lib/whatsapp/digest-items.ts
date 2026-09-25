import { db } from '@/lib/db'
import { emailsScanned } from '@/lib/db/schema'
import { and, eq, gte } from 'drizzle-orm'
import { scoreEmail } from '@/lib/scan/priority-score'
import type { DigestItem } from './digest-format'

/**
 * How far back the digest looks, in days. Deliberately the same 7 days as
 * `runScanForAccount`'s default scan window: the digest and the scanner must agree
 * on what "current" means. They did not before — the digest had no date bound at
 * all, so every untriaged row resurfaced in it forever, and the first digest after
 * the 2026-08-30 outage recovery arrived carrying 2026-04-29 email as news. DEC-1.
 */
export const DIGEST_MAX_AGE_DAYS = 7

/** Oldest email date the digest will include, inclusive. */
export function digestCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - DIGEST_MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * Actionable + unreviewed emails from the last DIGEST_MAX_AGE_DAYS days, highest
 * priority first. The date bound is applied in SQL because `emails_scanned` grows
 * without limit (785 rows in April 2026 alone), and because an item ageing out must
 * not be mutated — it stays `unreviewed` and visible in triage, it simply stops
 * being digest material.
 */
export async function loadDigestItems(now: Date = new Date()): Promise<DigestItem[]> {
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
        gte(emailsScanned.date, digestCutoff(now)),
      ),
    )

  return items
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
    .map(({ item }) => ({
      id: item.id,
      subject: item.subject,
      fromName: item.fromName,
      fromAddress: item.fromAddress,
      gmailMessageId: item.messageId,
      date: item.date,
    }))
}
