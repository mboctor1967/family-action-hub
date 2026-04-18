import { eq } from 'drizzle-orm'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { emailsScanned, tasks, topics, profiles, aiFeedback } from '@/lib/db/schema'

type Tx = {
  select: any
  insert: any
  update: any
}

export interface AiSuggestions {
  urgency?: string
  suggested_assignee?: string | null
  suggested_topic?: string | null
  due_date?: string | null
  action_summary?: string | null
}

/**
 * Confirm an email as a task. Throws if already triaged, if email not found,
 * or if any DB write fails. The caller passes a transaction context.
 * Returns the newly-created task id.
 */
export async function confirmEmailAsTask(
  tx: Tx,
  emailId: string,
  currentUserId: string,
): Promise<string> {
  const [email] = await tx.select().from(emailsScanned).where(eq(emailsScanned.id, emailId)).limit(1)
  if (!email) throw new Error(`Email not found: ${emailId}`)
  if (email.triageStatus && email.triageStatus !== 'unreviewed') {
    throw new Error(`Email ${emailId} already triaged (${email.triageStatus})`)
  }

  const suggestions: AiSuggestions = email.aiSuggestions ? JSON.parse(email.aiSuggestions) : {}

  let topicId: string | null = null
  if (suggestions.suggested_topic) {
    const [match] = await tx.select({ id: topics.id })
      .from(topics)
      .where(eq(topics.name, suggestions.suggested_topic))
      .limit(1)
    topicId = match?.id ?? null
  }

  let assigneeId: string | null = null
  if (suggestions.suggested_assignee) {
    const [match] = await tx.select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.name, suggestions.suggested_assignee))
      .limit(1)
    assigneeId = match?.id ?? null
  }
  if (!assigneeId) assigneeId = currentUserId

  const [task] = await tx.insert(tasks).values({
    title: email.subject || 'Untitled task',
    description: suggestions.action_summary || email.rawSnippet,
    status: 'new',
    priority: suggestions.urgency || 'medium',
    dueDate: suggestions.due_date ? new Date(suggestions.due_date) : null,
    assigneeId,
    createdBy: currentUserId,
    topicId,
    sourceEmailId: email.id,
    gmailLink: `https://mail.google.com/mail/u/0/#all/${email.messageId}`,
  }).returning()

  await tx.update(emailsScanned)
    .set({ triageStatus: 'confirmed' })
    .where(eq(emailsScanned.id, emailId))

  await tx.insert(aiFeedback).values({
    emailId: email.id,
    field: 'classification',
    aiValue: 'actionable',
    userCorrection: 'confirmed_actionable',
  })

  return task.id
}

export async function rejectEmail(tx: Tx, emailId: string): Promise<void> {
  const [email] = await tx.select().from(emailsScanned).where(eq(emailsScanned.id, emailId)).limit(1)
  if (!email) throw new Error(`Email not found: ${emailId}`)
  if (email.triageStatus && email.triageStatus !== 'unreviewed') {
    throw new Error(`Email ${emailId} already triaged (${email.triageStatus})`)
  }

  await tx.update(emailsScanned)
    .set({ triageStatus: 'rejected' })
    .where(eq(emailsScanned.id, emailId))

  await tx.insert(aiFeedback).values({
    emailId: email.id,
    field: 'classification',
    aiValue: 'actionable',
    userCorrection: 'not_actionable',
  })

  appendRejectionToConfig(email)
}

function appendRejectionToConfig(email: { fromAddress?: string | null; subject?: string | null }) {
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
}
