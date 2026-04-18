import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { emailsScanned } from '@/lib/db/schema'
import { eq, and, isNull, isNotNull } from 'drizzle-orm'
import { confirmEmailAsTask, rejectEmail } from '@/lib/scan/triage-actions'

// GET /api/scan/triage?status=unreviewed|confirmed|rejected|all
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Backfill: set triageStatus='unreviewed' for any actionable emails that predate this feature
  await db.update(emailsScanned)
    .set({ triageStatus: 'unreviewed' })
    .where(and(
      eq(emailsScanned.classification, 'actionable'),
      isNull(emailsScanned.triageStatus)
    ))

  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status') || 'unreviewed'

  const conditions = [isNotNull(emailsScanned.triageStatus)]
  if (statusFilter !== 'all') {
    conditions.push(eq(emailsScanned.triageStatus, statusFilter))
  }

  const results = await db.select()
    .from(emailsScanned)
    .where(and(...conditions))
    .orderBy(emailsScanned.date)

  // Parse aiSuggestions JSON for each result
  const parsed = results.map(r => ({
    ...r,
    aiSuggestions: r.aiSuggestions ? JSON.parse(r.aiSuggestions) : null,
  }))

  return NextResponse.json(parsed)
}

// POST /api/scan/triage — { emailId, action: 'confirm'|'reject' }
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { emailId, action } = body

  if (!emailId || !['confirm', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Neon HTTP driver does not support transactions; calls run sequentially.
  try {
    if (action === 'confirm') {
      const taskId = await confirmEmailAsTask(db as any, emailId, session.user!.id!)
      return NextResponse.json({ success: true, action: 'confirmed', taskId })
    } else {
      await rejectEmail(db as any, emailId)
      return NextResponse.json({ success: true, action: 'rejected' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    if (msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 })
    }
    if (msg.includes('already triaged')) {
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    console.error('Triage POST failed:', err)
    return NextResponse.json({ error: 'Triage failed' }, { status: 500 })
  }
}
