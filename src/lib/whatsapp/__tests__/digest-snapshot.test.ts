import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { persistSnapshot, getActiveSnapshotForPhone, expireSnapshotsForPhone } from '../digest-snapshot'
import { db } from '@/lib/db'

interface InsertedRow {
  recipient: string
  positions: string
  messageId: string | null
}

describe('digest-snapshot helpers', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('persistSnapshot inserts a row with serialized positions', async () => {
    const inserted: InsertedRow[] = []
    ;(db as unknown as { insert: () => { values: (row: InsertedRow) => { returning: () => Promise<Array<{ id: string }>> } } }).insert = () => ({
      values: (row: InsertedRow) => { inserted.push(row); return { returning: () => Promise.resolve([{ id: 'new-id' }]) } },
    })

    const id = await persistSnapshot({
      recipient: '+61412408587',
      positions: [{ pos: 1, emailId: 'a' }, { pos: 2, emailId: 'b' }],
      messageId: 'wamid.abc',
    })

    expect(id).toBe('new-id')
    // Stored recipient is normalised (no '+' prefix) so it matches webhook 'from' field
    expect(inserted[0].recipient).toBe('61412408587')
    expect(JSON.parse(inserted[0].positions)).toEqual([{ pos: 1, emailId: 'a' }, { pos: 2, emailId: 'b' }])
    expect(inserted[0].messageId).toBe('wamid.abc')
  })

  it('getActiveSnapshotForPhone returns latest active row with parsed positions', async () => {
    ;(db as unknown as { select: () => { from: () => { where: () => { orderBy: () => { limit: () => Promise<Array<{ id: string; recipient: string; sentAt: Date; positions: string }>> } } } } }).select = () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve([{
              id: 'snap-1',
              recipient: '+61412408587',
              sentAt: new Date('2026-04-20T20:00:00Z'),
              positions: JSON.stringify([{ pos: 1, emailId: 'a' }]),
            }]),
          }),
        }),
      }),
    })

    const result = await getActiveSnapshotForPhone('+61412408587')

    expect(result).toEqual({
      id: 'snap-1',
      recipient: '+61412408587',
      sentAt: new Date('2026-04-20T20:00:00Z'),
      positions: [{ pos: 1, emailId: 'a' }],
    })
  })

  it('getActiveSnapshotForPhone returns null when no active snapshot', async () => {
    ;(db as unknown as { select: () => { from: () => { where: () => { orderBy: () => { limit: () => Promise<never[]> } } } } }).select = () => ({
      from: () => ({ where: () => ({ orderBy: () => ({ limit: () => Promise.resolve([]) }) }) }),
    })
    expect(await getActiveSnapshotForPhone('+61499999999')).toBeNull()
  })

  interface UpdateVals {
    expiresAt: Date
  }

  it('expireSnapshotsForPhone sets expires_at = now for active rows of recipient', async () => {
    const calls: Array<{ vals: UpdateVals }> = []
    ;(db as unknown as { update: () => { set: (vals: UpdateVals) => { where: () => Promise<void> } } }).update = () => ({
      set: (vals: UpdateVals) => ({ where: () => { calls.push({ vals }); return Promise.resolve() } }),
    })

    await expireSnapshotsForPhone('+61412408587')

    expect(calls).toHaveLength(1)
    expect(calls[0].vals.expiresAt).toBeInstanceOf(Date)
  })
})
