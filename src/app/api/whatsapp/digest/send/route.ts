import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runDailyDigest } from '@/lib/whatsapp/daily-digest'

// Same work as the cron: a fresh scan with AI classification, then the send.
export const maxDuration = 300

/** "Send digest now" — the cron pipeline on demand. AC-008. */
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(await runDailyDigest())
}
