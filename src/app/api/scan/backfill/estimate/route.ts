import { NextRequest, NextResponse } from 'next/server'
import { estimateBackfill } from '@/lib/scan/backfill'
import { backfillGuard, backfillFailure, parseRange } from '../guard'

/** Estimate only — lists Gmail ids, classifies nothing, costs nothing. AC-010. */
export async function GET(req: NextRequest) {
  const g = await backfillGuard()
  if ('error' in g) return g.error
  const r = parseRange(req.nextUrl.searchParams.get('from'), req.nextUrl.searchParams.get('to'))
  if ('error' in r) return r.error
  try {
    return NextResponse.json(await estimateBackfill(g.accountId, r.from, r.to))
  } catch (err) {
    return backfillFailure(err)
  }
}
