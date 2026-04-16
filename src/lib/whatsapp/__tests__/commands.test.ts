import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { handleCommand } from '../commands'

describe('handleCommand', () => {
  it('returns unknown-command message for unrecognised input', async () => {
    const out = await handleCommand('frobnicate')
    expect(out.toLowerCase()).toContain('unknown command')
    expect(out).toContain('spend')
    expect(out).toContain('balance')
    expect(out).toContain('recent')
  })

  it('returns unknown-command message for empty input', async () => {
    const out = await handleCommand('')
    expect(out.toLowerCase()).toContain('unknown command')
  })
})
