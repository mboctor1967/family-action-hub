/**
 * POST /api/settings/ai-claude-toggle
 *
 * Flips the Claude AI toggle for ATO code proposals.
 * Requires `confirmed: true` in the body as a server-enforced extra check.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { setClaudeAtoEnabled } from '@/lib/app-settings'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { enabled, confirmed } = body as { enabled?: boolean; confirmed?: boolean }

  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
  }

  if (confirmed !== true) {
    return NextResponse.json(
      { error: 'confirmed must be true (confirmation dialog required)' },
      { status: 400 }
    )
  }

  await setClaudeAtoEnabled(enabled, session.user.id)

  return NextResponse.json({ ok: true, enabled })
}
