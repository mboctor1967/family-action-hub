import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Covers AC-007 (TC-009) and AC-008 (TC-010 / TC-011), plus the concurrency
 * change from AC-013.
 *
 * AC-007 is a data-integrity fix. The previous behaviour caught a JSON parse
 * failure and returned every email in the batch as `informational, confidence 0`
 * — which run-scan then wrote to emails_scanned as though the model had decided
 * it. Genuinely actionable mail was silently marked ignorable, and because those
 * rows landed in emails_scanned they were never re-examined on a later run.
 */

const h = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: h.create }
  },
}))

import { classifyEmails, type EmailInput } from '../classify'

const makeEmail = (id: string): EmailInput => ({
  messageId: id,
  from: 'Sender <s@example.com>',
  fromAddress: 's@example.com',
  subject: `Subject ${id}`,
  date: '2026-08-29',
  snippet: 'snippet',
  body: 'body',
})

const classificationFor = (ids: string[]) =>
  ids.map((messageId) => ({
    messageId,
    classification: 'actionable',
    confidence: 0.9,
    action_summary: 'Do the thing',
    suggested_assignee: 'Maged',
    suggested_topic: 'Finance',
    urgency: 'medium',
    due_date: null,
    reasoning: 'because',
  }))

const textResponse = (payload: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(payload) }],
})

const rateLimited = () => Object.assign(new Error('rate limited'), { status: 429 })

// baseDelayMs: 0 keeps the retry tests instant without faking timers.
const fast = { baseDelayMs: 0 }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('classifyEmails — parse failures (AC-007)', () => {
  it('TC-009 — throws on unparseable output instead of fabricating classifications', async () => {
    h.create.mockResolvedValue({ content: [{ type: 'text', text: 'I am not JSON at all' }] })

    await expect(classifyEmails([makeEmail('m1')], 'prompt', ['Finance'], fast)).rejects.toThrow()
  })

  it('never returns a fabricated informational result for an unparseable batch', async () => {
    h.create.mockResolvedValue({ content: [{ type: 'text', text: '<<<garbage>>>' }] })

    const result = await classifyEmails([makeEmail('m1')], 'prompt', [], fast).catch((e) => e)

    // The old behaviour resolved with invented rows. Anything that is not an
    // Error here means fabricated data reached the caller.
    expect(result).toBeInstanceOf(Error)
  })

  it('throws when the response is not a text block', async () => {
    h.create.mockResolvedValue({ content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }] })

    await expect(classifyEmails([makeEmail('m1')], 'prompt', [], fast)).rejects.toThrow()
  })

  it('still parses output wrapped in a markdown fence', async () => {
    h.create.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(classificationFor(['m1'])) + '\n```' }],
    })

    const result = await classifyEmails([makeEmail('m1')], 'prompt', [], fast)
    expect(result).toHaveLength(1)
    expect(result[0].classification).toBe('actionable')
  })
})

describe('classifyEmails — transient retry (AC-008)', () => {
  it('TC-010 — retries a 429 and succeeds within the attempt budget', async () => {
    h.create
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited())
      .mockResolvedValueOnce(textResponse(classificationFor(['m1'])))

    const result = await classifyEmails([makeEmail('m1')], 'prompt', [], fast)

    expect(h.create).toHaveBeenCalledTimes(3)
    expect(result).toHaveLength(1)
  })

  it('TC-011 — propagates the error after three consecutive failures', async () => {
    h.create.mockRejectedValue(rateLimited())

    await expect(classifyEmails([makeEmail('m1')], 'prompt', [], fast)).rejects.toThrow()

    expect(h.create).toHaveBeenCalledTimes(3)
  })

  it('does not retry a parse failure — retrying deterministic bad output is waste', async () => {
    h.create.mockResolvedValue({ content: [{ type: 'text', text: 'nope' }] })

    await expect(classifyEmails([makeEmail('m1')], 'prompt', [], fast)).rejects.toThrow()

    expect(h.create).toHaveBeenCalledTimes(1)
  })
})

describe('classifyEmails — throughput (AC-013)', () => {
  it('runs batches with concurrency 3 rather than one at a time', async () => {
    let inFlight = 0
    let peak = 0
    h.create.mockImplementation(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return textResponse(classificationFor(['x']))
    })

    // 15 emails at batchSize 5 = 3 batches, all of which should overlap.
    const emails = Array.from({ length: 15 }, (_, i) => makeEmail(`m${i}`))
    await classifyEmails(emails, 'prompt', [], fast)

    expect(h.create).toHaveBeenCalledTimes(3)
    expect(peak).toBe(3)
  })

  it('returns results from every batch', async () => {
    h.create.mockImplementation(async () => textResponse(classificationFor(['a', 'b', 'c', 'd', 'e'])))

    const emails = Array.from({ length: 10 }, (_, i) => makeEmail(`m${i}`))
    const result = await classifyEmails(emails, 'prompt', [], fast)

    expect(result).toHaveLength(10)
  })

  it('returns an empty array without calling the API when given no emails', async () => {
    const result = await classifyEmails([], 'prompt', [], fast)
    expect(result).toEqual([])
    expect(h.create).not.toHaveBeenCalled()
  })
})
