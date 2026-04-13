import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { emailsScanned, tasks, topics, profiles, aiFeedback } from '@/lib/db/schema'
import { eq, and, isNull, isNotNull } from 'drizzle-orm'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

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

// POST /api/scan/triage — { emailId, action: 'confirm'|'reject', edits?: { title, priority, assigneeId, topicId } }
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { emailId, action, edits } = body

  if (!emailId || !['confirm', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Fetch the email
  const [email] = await db.select().from(emailsScanned).where(eq(emailsScanned.id, emailId))
  if (!email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }
  if (email.triageStatus !== 'unreviewed') {
    return NextResponse.json({ error: 'Already triaged' }, { status: 409 })
  }

  if (action === 'confirm') {
    const suggestions = email.aiSuggestions ? JSON.parse(email.aiSuggestions) : {}

    // Resolve topic
    let topicId = edits?.topicId || null
    if (!topicId && suggestions.suggested_topic) {
      const topicResult = await db.select({ id: topics.id })
        .from(topics)
        .where(eq(topics.name, suggestions.suggested_topic))
        .limit(1)
      topicId = topicResult[0]?.id || null
    }

    // Resolve assignee
    let assigneeId = edits?.assigneeId || null
    if (!assigneeId && suggestions.suggested_assignee) {
      const assigneeResult = await db.select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.name, suggestions.suggested_assignee))
        .limit(1)
      assigneeId = assigneeResult[0]?.id || null
    }
    if (!assigneeId) assigneeId = session.user.id

    // Create the task
    const [task] = await db.insert(tasks).values({
      title: edits?.title || email.subject || 'Untitled task',
      description: suggestions.action_summary || email.rawSnippet,
      status: 'new',
      priority: edits?.priority || suggestions.urgency || 'medium',
      dueDate: suggestions.due_date ? new Date(suggestions.due_date) : null,
      assigneeId,
      createdBy: session.user.id!,
      topicId,
      sourceEmailId: email.id,
      gmailLink: `https://mail.google.com/mail/u/0/#all/${email.messageId}`,
    }).returning()

    // Update triage status
    await db.update(emailsScanned)
      .set({ triageStatus: 'confirmed' })
      .where(eq(emailsScanned.id, emailId))

    // Record positive feedback
    await db.insert(aiFeedback).values({
      emailId: email.id,
      field: 'classification',
      aiValue: 'actionable',
      userCorrection: 'confirmed_actionable',
    })

    return NextResponse.json({ success: true, action: 'confirmed', taskId: task.id })
  }

  if (action === 'reject') {
    // Update triage status
    await db.update(emailsScanned)
      .set({ triageStatus: 'rejected' })
      .where(eq(emailsScanned.id, emailId))

    // Record negative feedback in DB
    await db.insert(aiFeedback).values({
      emailId: email.id,
      field: 'classification',
      aiValue: 'actionable',
      userCorrection: 'not_actionable',
    })

    // Append learned rule to classification config
    try {
      const configPath = join(process.cwd(), 'config', 'classification.json')
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))

      const fromAddress = email.fromAddress || ''
      const fromDomain = fromAddress.includes('@') ? fromAddress.split('@')[1] : fromAddress

      const learnedRule = {
        sender: fromDomain,
        subject_pattern: email.subject || '',
        learned: 'not actionable',
        original_classification: 'actionable',
        corrected_to: 'noise/informational',
        date: new Date().toISOString().split('T')[0],
      }

      const realRules = config.user_feedback_rules.filter((r: any) => typeof r === 'object')
      realRules.push(learnedRule)
      config.user_feedback_rules = realRules

      writeFileSync(configPath, JSON.stringify(config, null, 2))
    } catch (err) {
      console.error('Failed to update classification config:', err)
    }

    return NextResponse.json({ success: true, action: 'rejected' })
  }
}
