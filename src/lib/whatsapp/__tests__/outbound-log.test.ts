import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * AC-005 / AC-007 — the outbound delivery log.
 * Meta does not guarantee status callbacks arrive in order, so a late `sent` must
 * never overwrite `delivered`/`read` and falsely flag the recipient.
 */

const h = vi.hoisted(() => ({
  updates: [] as Array<{ set: Record<string, unknown>; where: unknown }>,
  selectResults: [] as unknown[][],
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const orig = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...orig,
    // Capture the allowed prior statuses so the test can assert monotonic updates.
    inArray: (col: unknown, values: unknown[]) => ({ op: 'inArray', col, values }),
    and: (...conds: unknown[]) => ({ op: 'and', conds }),
    eq: (col: unknown, value: unknown) => ({ op: 'eq', col, value }),
  }
})
vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: async (where: unknown) => { h.updates.push({ set, where }) },
      }),
    }),
    select: () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: async () => h.selectResults.shift() ?? [],
      }
      return chain
    },
  },
}))

import { applyStatusUpdate, allowedPriorStatuses, getDeliveryHealth } from '../outbound-log'

type Where = { op: string; conds: Array<{ op: string; value?: unknown; values?: unknown[] }> }

beforeEach(() => {
  h.updates = []
  h.selectResults = []
})

describe('applyStatusUpdate (AC-005)', () => {
  it('converts the unix timestamp and stores the Meta error', async () => {
    await applyStatusUpdate({ id: 'w1', status: 'failed', timestamp: '1790280007', errorCode: 131047, errorTitle: 'Re-engagement message' })
    const { set } = h.updates[0]
    expect(set.status).toBe('failed')
    expect((set.statusAt as Date).toISOString()).toBe(new Date(1790280007 * 1000).toISOString())
    expect(set.errorCode).toBe(131047)
    expect(set.errorTitle).toBe('Re-engagement message')
  })

  it('only moves forward: a late "sent" cannot overwrite delivered or read', async () => {
    await applyStatusUpdate({ id: 'w1', status: 'sent', timestamp: '1' })
    const where = h.updates[0].where as Where
    const prior = where.conds.find((c) => c.op === 'inArray')!.values
    expect(prior).toEqual(['accepted'])
  })

  it('ignores an unknown status rather than writing it', async () => {
    await applyStatusUpdate({ id: 'w1', status: 'deleted', timestamp: '1' })
    expect(h.updates).toHaveLength(0)
  })
})

describe('allowedPriorStatuses', () => {
  it('ranks accepted < sent < delivered < read; failed only replaces unconfirmed states', () => {
    expect(allowedPriorStatuses('delivered')).toEqual(['accepted', 'sent'])
    expect(allowedPriorStatuses('read')).toEqual(['accepted', 'sent', 'delivered'])
    expect(allowedPriorStatuses('failed')).toEqual(['accepted', 'sent'])
  })
})

describe('getDeliveryHealth (AC-007)', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'x', recipient: '+61412408587', kind: 'reply', status: 'delivered', errorCode: null, errorTitle: null,
    createdAt: new Date(), statusAt: new Date(), ...over,
  })

  it('healthy when the latest digest was delivered', async () => {
    h.selectResults = [[row({ kind: 'digest_notice', status: 'read' })], [row({})], []]
    const [r] = await getDeliveryHealth(['+61412408587'])
    expect(r.needsAttention).toBe(false)
    expect(r.lastDigestStatus).toBe('read')
  })

  it('needs attention when the latest digest failed, with the failure surfaced', async () => {
    const failed = row({ kind: 'digest_notice', status: 'failed', errorCode: 131047, errorTitle: 'Re-engagement message' })
    h.selectResults = [[failed], [], [failed]]
    const [r] = await getDeliveryHealth(['+61412408587'])
    expect(r.needsAttention).toBe(true)
    expect(r.lastFailure).toMatchObject({ code: 131047, title: 'Re-engagement message' })
  })

  it('needs attention when a digest has sat unconfirmed for over an hour', async () => {
    h.selectResults = [[row({ kind: 'digest_notice', status: 'accepted', createdAt: new Date(Date.now() - 2 * 3600_000) })], [], []]
    const [r] = await getDeliveryHealth(['+61412408587'])
    expect(r.needsAttention).toBe(true)
  })

  it('not flagged while a fresh digest awaits its receipt', async () => {
    h.selectResults = [[row({ kind: 'digest_notice', status: 'accepted', createdAt: new Date() })], [], []]
    const [r] = await getDeliveryHealth(['+61412408587'])
    expect(r.needsAttention).toBe(false)
  })

  it('needs attention when no digest has ever been recorded', async () => {
    h.selectResults = [[], [], []]
    const [r] = await getDeliveryHealth(['+61412408587'])
    expect(r.needsAttention).toBe(true)
  })
})
