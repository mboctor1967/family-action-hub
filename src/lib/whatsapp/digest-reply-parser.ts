export type ParsedReply = {
  confirm: number[]
  reject: number[]
  help: boolean
  outOfRange: number[]
  conflicts: number[]
}

const RANGE_TOKEN = /^(\d+)-(\d+)$/
const NUM_TOKEN = /^\d+$/

function expandSelector(selector: string, n: number): number[] {
  const trimmed = selector.trim().toLowerCase()
  if (!trimmed) return []
  if (trimmed === 'all') return Array.from({ length: n }, (_, i) => i + 1)
  if (trimmed === 'rest') return [] // handled at caller level
  const out: number[] = []
  for (const part of trimmed.split(',').map((p) => p.trim()).filter(Boolean)) {
    const rangeMatch = part.match(RANGE_TOKEN)
    if (rangeMatch) {
      const a = parseInt(rangeMatch[1], 10)
      const b = parseInt(rangeMatch[2], 10)
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      for (let i = lo; i <= hi; i++) out.push(i)
      continue
    }
    if (NUM_TOKEN.test(part)) {
      out.push(parseInt(part, 10))
      continue
    }
    return [] // invalid token
  }
  return out
}

export function parseDigestReply(text: string, n: number): ParsedReply | null {
  if (!text) return null
  const normalised = text.trim().toLowerCase()
  if (!normalised) return null
  if (normalised === 'help') {
    return { confirm: [], reject: [], help: true, outOfRange: [], conflicts: [] }
  }
  if (normalised === 'done') {
    return {
      confirm: [],
      reject: Array.from({ length: n }, (_, i) => i + 1),
      help: false,
      outOfRange: [],
      conflicts: [],
    }
  }

  // Tokenise into commands. Commands start at 'task' or 'reject'.
  const words = normalised.split(/\s+/)
  let confirm: number[] = []
  let reject: number[] = []
  let rejectRest = false
  let i = 0

  while (i < words.length) {
    const word = words[i]
    if (word !== 'task' && word !== 'reject') return null
    const selectorParts: string[] = []
    i++
    while (i < words.length && words[i] !== 'task' && words[i] !== 'reject') {
      selectorParts.push(words[i])
      i++
    }
    const selectorRaw = selectorParts.join('')
    if (!selectorRaw) return null // bare 'task' or 'reject'
    if (selectorRaw === 'rest') {
      if (word === 'task') return null // 'task rest' is nonsense
      rejectRest = true
      continue
    }
    const positions = expandSelector(selectorRaw, n)
    if (positions.length === 0) return null
    if (word === 'task') confirm.push(...positions)
    else reject.push(...positions)
  }

  // Dedupe and clamp
  const dedupe = (arr: number[]) => Array.from(new Set(arr)).sort((a, b) => a - b)
  const outOfRangeSet = new Set<number>()
  const filterRange = (arr: number[]): number[] => {
    const kept: number[] = []
    for (const p of arr) {
      if (p >= 1 && p <= n) kept.push(p)
      else outOfRangeSet.add(p)
    }
    return kept
  }

  confirm = dedupe(filterRange(confirm))
  reject = dedupe(filterRange(reject))

  if (rejectRest) {
    const taskedSet = new Set(confirm)
    const rejectSet = new Set(reject)
    for (let p = 1; p <= n; p++) {
      if (!taskedSet.has(p) && !rejectSet.has(p)) reject.push(p)
    }
    reject = dedupe(reject)
  }

  // Conflicts: positions in both confirm and reject — confirm wins
  const confirmSet = new Set(confirm)
  const conflicts: number[] = []
  reject = reject.filter((p) => {
    if (confirmSet.has(p)) {
      conflicts.push(p)
      return false
    }
    return true
  })

  // If after parsing we have no actions at all, and no rejectRest triggered, unrecognised.
  if (confirm.length === 0 && reject.length === 0 && !rejectRest) return null

  return {
    confirm,
    reject,
    help: false,
    outOfRange: Array.from(outOfRangeSet).sort((a, b) => a - b),
    conflicts: conflicts.sort((a, b) => a - b),
  }
}
