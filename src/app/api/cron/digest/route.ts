import { NextRequest, NextResponse } from 'next/server'
import { runDailyDigest } from '@/lib/whatsapp/daily-digest'

export { DIGEST_MAX_AGE_DAYS, digestCutoff } from '@/lib/whatsapp/digest-items'

// The scan runs inline in this request: a recovery run after an outage fetches up
// to 100 emails and classifies them in batches. Without this the first successful
// run after a long gap is the one most likely to be cut off. See DEC-5 / AC-013.
export const maxDuration = 300

// Vercel Cron invokes scheduled paths via GET, injecting `Authorization: Bearer $CRON_SECRET`.
// The WhatsApp "scan" command and the Settings "Send digest now" button call runDailyDigest directly.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  return NextResponse.json(await runDailyDigest())
}
