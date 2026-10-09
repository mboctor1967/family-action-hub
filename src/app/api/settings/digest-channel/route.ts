import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  DIGEST_CHANNELS,
  getDigestChannel,
  setDigestChannel,
  type DigestChannel,
} from '@/lib/digest/channel'

/**
 * Read and set where the daily digest is delivered.
 *
 * See docs/features/2026-10-10-digest-channel-email.md. A setting rather than an env
 * var so it can be changed without a redeploy — which matters because the reason it
 * exists is that one channel stopped working with no warning.
 */

export async function GET(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ channel: await getDigestChannel() })
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const requested = (body as { channel?: unknown } | null)?.channel

  // Validated strictly here, unlike parseChannel which coerces: a user picking a
  // channel should be told their value was wrong, not silently given a different one.
  if (!(DIGEST_CHANNELS as readonly unknown[]).includes(requested)) {
    return NextResponse.json(
      { error: `channel must be one of: ${DIGEST_CHANNELS.join(', ')}` },
      { status: 400 },
    )
  }

  await setDigestChannel(requested as DigestChannel, session.user.email ?? undefined)
  return NextResponse.json({ channel: requested })
}
