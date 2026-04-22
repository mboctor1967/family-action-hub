import { describe, it, expect } from 'vitest'
import {
  formatDigest,
  formatHelp,
  formatZeroItems,
  formatFailure,
  formatTriageResult,
  formatNoSnapshot,
  formatUnrecognised,
} from '../digest-format'

const STATS = {
  windowFromLabel: '15 Apr',
  windowToLabel: '22 Apr',
  totalEmails: 87,
  newEmails: 12,
  alreadyScanned: 75,
  actionableCount: 2,
}

describe('formatDigest', () => {
  const items = [
    { id: 'uuid-1', subject: 'Electricity bill', fromName: 'AGL', fromAddress: 'no-reply@agl.com.au', gmailMessageId: 'abc' },
    { id: 'uuid-2', subject: 'ATO notice', fromName: null, fromAddress: 'ato@notifications.gov.au', gmailMessageId: 'def' },
  ]

  it('formats header + window stats + numbered items + reply grammar', () => {
    const out = formatDigest(items, { dateLabel: '2026-04-22', overflowCount: 0, stats: STATS })
    expect(out).toContain('Gmail digest — 2026-04-22')
    expect(out).toContain('Window: 15 Apr – 22 Apr')
    expect(out).toContain('87 emails (12 new, 75 already scanned)')
    expect(out).toContain('2 actionable')
    expect(out).toContain('1. Electricity bill')
    expect(out).toContain('From: AGL <no-reply@agl.com.au>')
    expect(out).toContain('https://mail.google.com/mail/u/0/#all/abc')
    expect(out).toContain('2. ATO notice')
    expect(out).toContain('From: ato@notifications.gov.au')
    expect(out).toContain('Reply:')
    expect(out).toContain('task 1,3')
  })

  it('falls back to fromAddress only when fromName missing', () => {
    const out = formatDigest(items, { dateLabel: '2026-04-22', overflowCount: 0, stats: STATS })
    expect(out).toContain('From: ato@notifications.gov.au')
    expect(out).not.toContain('From: null')
  })

  it('appends overflow footer when overflowCount > 0', () => {
    const out = formatDigest(items, { dateLabel: '2026-04-22', overflowCount: 5, stats: STATS })
    expect(out).toContain('+5 more — open /scan to review all.')
  })

  it('omits overflow footer when overflowCount = 0', () => {
    const out = formatDigest(items, { dateLabel: '2026-04-22', overflowCount: 0, stats: STATS })
    expect(out).not.toContain('+0 more')
    expect(out).not.toContain('more — open /scan')
  })

  it('flags partial stats when scanFailed = true', () => {
    const out = formatDigest(items, {
      dateLabel: '2026-04-22',
      overflowCount: 0,
      stats: { ...STATS, scanFailed: true },
    })
    expect(out).toContain('⚠️ scan error')
  })
})

describe('formatZeroItems', () => {
  it('says no new emails when newEmails = 0', () => {
    const out = formatZeroItems({ ...STATS, newEmails: 0, alreadyScanned: 87, actionableCount: 0 })
    expect(out).toContain('✅ Inbox clear — no new emails since last scan.')
    expect(out).toContain('Window: 15 Apr – 22 Apr')
    expect(out).toContain('0 actionable')
  })

  it('explains new-but-none-actionable when newEmails > 0 and actionableCount = 0', () => {
    const out = formatZeroItems({ ...STATS, newEmails: 12, alreadyScanned: 75, actionableCount: 0 })
    expect(out).toContain('12 new emails, none need action.')
    expect(out).toContain('Window: 15 Apr – 22 Apr')
  })

  it('uses singular "email" when newEmails = 1', () => {
    const out = formatZeroItems({ ...STATS, newEmails: 1, alreadyScanned: 86, actionableCount: 0 })
    expect(out).toContain('1 new email, none need action.')
  })
})

describe('formatHelp', () => {
  it('lists all commands and includes example', () => {
    const out = formatHelp()
    expect(out).toContain('task 1,3')
    expect(out).toContain('task 1-5')
    expect(out).toContain('task all')
    expect(out).toContain('reject rest')
    expect(out).toContain('done')
    expect(out).toContain('help')
    expect(out).toContain('Example:')
  })
})

describe('formatUnrecognised', () => {
  it('prefixes help with didn\'t-catch message', () => {
    const out = formatUnrecognised()
    expect(out).toMatch(/didn'?t catch that/i)
    expect(out).toContain('task 1,3')
  })
})

describe('formatFailure', () => {
  it('warns about scan failure', () => {
    expect(formatFailure()).toBe('⚠️ Digest failed — scan error. Open /scan to review manually.')
  })
})

describe('formatNoSnapshot', () => {
  it('returns friendly no-active-digest message', () => {
    expect(formatNoSnapshot()).toContain('No active digest')
  })
})

describe('formatTriageResult', () => {
  it('reports N tasks created, M rejected', () => {
    expect(formatTriageResult({ created: 3, rejected: 4, failed: 0, outOfRange: [], conflicts: [] }))
      .toContain('3 tasks created, 4 rejected')
  })

  it('appends warnings when failed > 0', () => {
    const out = formatTriageResult({ created: 2, rejected: 1, failed: 1, outOfRange: [], conflicts: [] })
    expect(out).toContain('⚠️ 1 failed')
  })

  it('appends out-of-range warning', () => {
    const out = formatTriageResult({ created: 1, rejected: 0, failed: 0, outOfRange: [21, 22], conflicts: [] })
    expect(out).toContain('Ignored out-of-range: 21, 22')
  })

  it('appends conflict warning when same position in both', () => {
    const out = formatTriageResult({ created: 1, rejected: 0, failed: 0, outOfRange: [], conflicts: [3] })
    expect(out).toContain('Position 3 in both task and reject')
  })
})
