export type ScoreInput = {
  date: Date | null
  subject: string | null
  rawSnippet: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const DEADLINE_RE = /\b(due|overdue|by\s+\d|deadline|expires?)\b/
const DOLLAR_RE = /\$\s?\d/

export function scoreEmail(input: ScoreInput): number {
  const ageDays = input.date
    ? Math.floor((Date.now() - input.date.getTime()) / DAY_MS)
    : 0
  const text = `${input.subject ?? ''} ${input.rawSnippet ?? ''}`.toLowerCase()
  const hasDeadline = DEADLINE_RE.test(text)
  const hasDollar = DOLLAR_RE.test(text)
  return ageDays + (hasDeadline ? 2 : 0) + (hasDollar ? 1 : 0)
}
