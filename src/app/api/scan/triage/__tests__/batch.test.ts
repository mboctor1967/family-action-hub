import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-1', role: 'admin' } }),
}))

vi.mock('@/lib/db', () => ({
  db: {
    transaction: vi.fn(async (cb) => cb({})),
  },
}))

const confirmSpy = vi.fn().mockResolvedValue('task-new')
const rejectSpy = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/scan/triage-actions', () => ({
  confirmEmailAsTask: (...args: any[]) => confirmSpy(...args),
  rejectEmail: (...args: any[]) => rejectSpy(...args),
}))

describe('POST /api/scan/triage/batch', () => {
  it('confirms and rejects in one transaction and returns task ids', async () => {
    const { POST } = await import('../batch/route')
    const req = new Request('http://localhost/api/scan/triage/batch', {
      method: 'POST',
      body: JSON.stringify({ confirmIds: ['e1', 'e2'], rejectIds: ['e3'] }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.taskIds).toEqual(['task-new', 'task-new'])
    expect(body.rejected).toBe(1)
    expect(confirmSpy).toHaveBeenCalledTimes(2)
    expect(rejectSpy).toHaveBeenCalledTimes(1)
  })

  it('returns 400 when body is malformed', async () => {
    const { POST } = await import('../batch/route')
    const req = new Request('http://localhost/api/scan/triage/batch', {
      method: 'POST',
      body: JSON.stringify({ confirmIds: 'not-an-array' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
