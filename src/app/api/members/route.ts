import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const members = await db.select({
    id: profiles.id,
    name: profiles.name,
    email: profiles.email,
    avatarUrl: profiles.avatarUrl,
    role: profiles.role,
  }).from(profiles)

  return NextResponse.json(members)
}
