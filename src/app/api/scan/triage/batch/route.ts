import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { confirmEmailAsTask, rejectEmail } from '@/lib/scan/triage-actions'

interface BatchBody {
  confirmIds?: unknown
  rejectIds?: unknown
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: BatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const confirmIds: string[] = isStringArray(body.confirmIds) ? body.confirmIds : []
  const rejectIds: string[] = isStringArray(body.rejectIds) ? body.rejectIds : []

  if (!isStringArray(body.confirmIds ?? []) || !isStringArray(body.rejectIds ?? [])) {
    return NextResponse.json({ error: 'confirmIds and rejectIds must be string arrays' }, { status: 400 })
  }
  if (confirmIds.length === 0 && rejectIds.length === 0) {
    return NextResponse.json({ error: 'At least one of confirmIds or rejectIds must be non-empty' }, { status: 400 })
  }

  try {
    const taskIds = await db.transaction(async (tx) => {
      const created: string[] = []
      for (const id of confirmIds) {
        created.push(await confirmEmailAsTask(tx as any, id, session.user!.id!))
      }
      for (const id of rejectIds) {
        await rejectEmail(tx as any, id)
      }
      return created
    })
    return NextResponse.json({ taskIds, rejected: rejectIds.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    if (msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 })
    }
    if (msg.includes('already triaged')) {
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    console.error('Batch triage failed:', err)
    return NextResponse.json({ error: 'Batch triage failed' }, { status: 500 })
  }
}
