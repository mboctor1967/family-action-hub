import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { aiFeedback, tasks, emailsScanned } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { vote, reason } = body // vote: 'up' | 'down', reason?: string

    // Get task with source email
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
      with: { sourceEmail: true },
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Store feedback in DB
    if (task.sourceEmailId) {
      await db.insert(aiFeedback).values({
        emailId: task.sourceEmailId,
        field: 'classification',
        aiValue: 'actionable',
        userCorrection: vote === 'down' ? 'not_actionable' : 'confirmed_actionable',
      })
    }

    // If thumbs down, append a learned rule to the config file
    if (vote === 'down' && task.sourceEmail) {
      const configPath = join(process.cwd(), 'config', 'classification.json')
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))

      const fromAddress = task.sourceEmail.fromAddress || ''
      const fromDomain = fromAddress.includes('@') ? fromAddress.split('@')[1] : fromAddress
      const subject = task.sourceEmail.subject || ''

      const learnedRule = {
        sender: fromDomain,
        subject_pattern: subject,
        learned: reason || 'not actionable',
        original_classification: 'actionable',
        corrected_to: 'noise/informational',
        date: new Date().toISOString().split('T')[0],
      }

      // Add to feedback rules (filter out comment lines first time)
      const realRules = config.user_feedback_rules.filter((r: any) => typeof r === 'object')
      realRules.push(learnedRule)
      config.user_feedback_rules = realRules

      writeFileSync(configPath, JSON.stringify(config, null, 2))
    }

    // If thumbs up, record positive signal
    if (vote === 'up' && task.sourceEmail) {
      const configPath = join(process.cwd(), 'config', 'classification.json')
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))

      const fromAddress = task.sourceEmail.fromAddress || ''
      const fromDomain = fromAddress.includes('@') ? fromAddress.split('@')[1] : fromAddress

      const learnedRule = {
        sender: fromDomain,
        subject_pattern: task.sourceEmail.subject || '',
        learned: reason || 'correctly actionable',
        original_classification: 'actionable',
        confirmed: true,
        date: new Date().toISOString().split('T')[0],
      }

      const realRules = config.user_feedback_rules.filter((r: any) => typeof r === 'object')
      realRules.push(learnedRule)
      config.user_feedback_rules = realRules

      writeFileSync(configPath, JSON.stringify(config, null, 2))
    }

    return NextResponse.json({ success: true, vote })
  } catch (error) {
    console.error('Feedback error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save feedback' },
      { status: 500 }
    )
  }
}
