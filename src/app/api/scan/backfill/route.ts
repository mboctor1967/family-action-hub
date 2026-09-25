import { NextRequest, NextResponse } from 'next/server'
import { runBackfillChunk } from '@/lib/scan/backfill'
import { backfillGuard, backfillFailure, parseRange } from './guard'

// One chunk = one normal-sized scan (fetch + AI classification of up to 100 emails).
export const maxDuration = 300

/** Runs one chunk; the client repeats until `remaining` is 0 or `stalled`. AC-010. */
export async function POST(req: NextRequest) {
  const g = await backfillGuard()
  if ('error' in g) return g.error
  const body = await req.json().catch(() => ({}))
  const r = parseRange(body.from, body.to)
  if ('error' in r) return r.error
  try {
    return NextResponse.json(await runBackfillChunk(g.accountId, r.from, r.to))
  } catch (err) {
    return backfillFailure(err)
  }
}
