import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialTransactions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()

  // Only allow updating specific fields for manual review
  const allowedFields: Record<string, any> = {}
  if (body.category !== undefined) allowedFields.category = body.category
  if (body.subcategory !== undefined) allowedFields.subcategory = body.subcategory
  if (body.merchantName !== undefined) allowedFields.merchantName = body.merchantName
  if (body.isTaxDeductible !== undefined) allowedFields.isTaxDeductible = body.isTaxDeductible
  if (body.taxCategory !== undefined) allowedFields.taxCategory = body.taxCategory
  if (body.isSubscription !== undefined) allowedFields.isSubscription = body.isSubscription
  if (body.subscriptionFrequency !== undefined) allowedFields.subscriptionFrequency = body.subscriptionFrequency
  if (body.needsReview !== undefined) allowedFields.needsReview = body.needsReview

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const [updated] = await db.update(financialTransactions)
    .set(allowedFields)
    .where(eq(financialTransactions.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}
