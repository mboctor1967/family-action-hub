import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { comments, profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { body } = await request.json()

  const [comment] = await db.insert(comments).values({
    taskId: id,
    userId: session.user.id,
    body,
  }).returning()

  // Get user info for the response
  const user = await db.select({ id: profiles.id, name: profiles.name, avatarUrl: profiles.avatarUrl })
    .from(profiles)
    .where(eq(profiles.id, session.user.id))
    .limit(1)

  return NextResponse.json({ ...comment, user: user[0] }, { status: 201 })
}
