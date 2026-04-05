import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialAccounts } from '@/lib/db/schema'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const accounts = await db.query.financialAccounts.findMany({
    with: { entity: true },
    orderBy: (a, { asc }) => [asc(a.bankName), asc(a.accountName)],
  })

  return NextResponse.json(accounts)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  if (!body.bankName?.trim()) return NextResponse.json({ error: 'Bank name is required' }, { status: 400 })

  const digits = (body.accountNumber || '').replace(/\D/g, '')

  const [account] = await db.insert(financialAccounts).values({
    bankName: body.bankName.trim(),
    accountName: body.accountName?.trim() || null,
    accountNumber: body.accountNumber?.trim() || null,
    accountNumberLast4: digits.length >= 4 ? digits.slice(-4) : null,
    bsb: body.bsb?.trim() || null,
    accountType: body.accountType || 'personal_cheque',
    entityId: body.entityId || null,
  }).returning()

  return NextResponse.json(account, { status: 201 })
}
