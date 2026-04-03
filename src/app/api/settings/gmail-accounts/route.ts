import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { gmailAccounts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await db.select({
    id: gmailAccounts.id,
    email: gmailAccounts.email,
    lastScanAt: gmailAccounts.lastScanAt,
  }).from(gmailAccounts)

  return NextResponse.json(accounts)
}
