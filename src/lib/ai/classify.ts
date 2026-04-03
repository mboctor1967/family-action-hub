import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export interface EmailInput {
  messageId: string
  from: string
  fromAddress: string
  subject: string
  date: string
  snippet: string
  body: string
}

export interface ClassificationResult {
  messageId: string
  classification: 'actionable' | 'informational' | 'noise'
  confidence: number
  action_summary: string | null
  suggested_assignee: string | null
  suggested_topic: string | null
  urgency: 'urgent' | 'high' | 'medium' | 'low'
  due_date: string | null
  reasoning: string
}

export async function classifyEmails(
  emails: EmailInput[],
  skillPrompt: string,
  topicNames: string[]
): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = []

  // Process in batches of 5, one at a time to stay within rate limits
  const batchSize = 5
  const concurrency = 1
  const batches: EmailInput[][] = []
  for (let i = 0; i < emails.length; i += batchSize) {
    batches.push(emails.slice(i, i + batchSize))
  }

  for (let i = 0; i < batches.length; i += concurrency) {
    const concurrent = batches.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      concurrent.map((batch) => classifyBatch(batch, skillPrompt, topicNames))
    )
    results.push(...batchResults.flat())
  }

  return results
}

async function classifyBatch(
  emails: EmailInput[],
  skillPrompt: string,
  topicNames: string[]
): Promise<ClassificationResult[]> {
  const emailsFormatted = emails
    .map(
      (e, idx) =>
        `--- EMAIL ${idx + 1} (ID: ${e.messageId}) ---
From: ${e.from}
Subject: ${e.subject}
Date: ${e.date}
Body: ${e.body.substring(0, 500)}
---`
    )
    .join('\n\n')

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: `${skillPrompt}

AVAILABLE TOPICS: ${topicNames.join(', ')}

RESPONSE FORMAT: Return a JSON array with one object per email. Each object must have:
- messageId: string (the email ID provided)
- classification: "actionable" | "informational" | "noise"
- confidence: number between 0 and 1
- action_summary: string or null (only for actionable emails)
- suggested_assignee: string or null ("Maged" or "Mandy")
- suggested_topic: string or null (must be from AVAILABLE TOPICS)
- urgency: "urgent" | "high" | "medium" | "low"
- due_date: string (ISO date) or null
- reasoning: string (brief explanation)

Return ONLY valid JSON array, no other text.`,
    messages: [
      {
        role: 'user',
        content: `Classify these ${emails.length} emails:\n\n${emailsFormatted}`,
      },
    ],
  })

  const responseText =
    message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    // Try to parse JSON from response (handle potential markdown wrapping)
    const jsonStr = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    const parsed = JSON.parse(jsonStr) as ClassificationResult[]
    return parsed
  } catch {
    console.error('Failed to parse AI response:', responseText)
    // Return safe defaults
    return emails.map((e) => ({
      messageId: e.messageId,
      classification: 'informational' as const,
      confidence: 0,
      action_summary: null,
      suggested_assignee: null,
      suggested_topic: null,
      urgency: 'medium' as const,
      due_date: null,
      reasoning: 'Classification failed - defaulting to informational',
    }))
  }
}
