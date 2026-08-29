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

export interface ClassifyOptions {
  /** Base delay for transient-failure backoff. Tests pass 0. */
  baseDelayMs?: number
}

/** Transient = worth retrying. Deterministic failures (bad JSON) are not. */
class ClassificationParseError extends Error {}

const MAX_ATTEMPTS = 3

function isTransient(err: unknown): boolean {
  if (err instanceof ClassificationParseError) return false
  const e = (err ?? {}) as { status?: number; response?: { status?: number } }
  const status = e.status ?? e.response?.status
  return status === undefined || status === 429 || status >= 500
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function withRetry<T>(fn: () => Promise<T>, baseDelayMs: number): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransient(err) || attempt === MAX_ATTEMPTS) throw err
      // 1s / 2s between attempts by default.
      if (baseDelayMs > 0) await sleep(baseDelayMs * 2 ** (attempt - 1))
    }
  }
  throw lastErr
}

export async function classifyEmails(
  emails: EmailInput[],
  skillPrompt: string,
  topicNames: string[],
  opts: ClassifyOptions = {}
): Promise<ClassificationResult[]> {
  const { baseDelayMs = 1000 } = opts
  const results: ClassificationResult[] = []

  // Batches of 5. Concurrency 3 (raised from 1): a 100-email recovery run is 20
  // sequential calls otherwise, which risks the function timeout on the first
  // successful scan after an outage. See AC-013.
  const batchSize = 5
  const concurrency = 3
  const batches: EmailInput[][] = []
  for (let i = 0; i < emails.length; i += batchSize) {
    batches.push(emails.slice(i, i + batchSize))
  }

  for (let i = 0; i < batches.length; i += concurrency) {
    const concurrent = batches.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      concurrent.map((batch) =>
        withRetry(() => classifyBatch(batch, skillPrompt, topicNames), baseDelayMs)
      )
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
    message.content[0]?.type === 'text' ? message.content[0].text : ''

  // Parse JSON from the response (handling potential markdown wrapping).
  //
  // A failure here MUST throw. The previous implementation returned every email
  // in the batch as `informational, confidence 0`, which run-scan then persisted
  // to emails_scanned as though the model had classified them — silently burying
  // actionable mail and, because the rows existed, never revisiting it. Failing
  // the batch leaves those emails unscanned so the next run picks them up.
  const jsonStr = responseText
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    console.error('[classify] failed to parse AI response:', responseText.slice(0, 500))
    throw new ClassificationParseError(
      `AI classification returned unparseable output for ${emails.length} email(s)`
    )
  }

  if (!Array.isArray(parsed)) {
    console.error('[classify] AI response was not an array:', responseText.slice(0, 500))
    throw new ClassificationParseError('AI classification did not return a JSON array')
  }

  return parsed as ClassificationResult[]
}

