import { describe, it, expect } from 'vitest'
import { scoreEmail } from '../priority-score'

const day = 24 * 60 * 60 * 1000

describe('scoreEmail', () => {
  it('ageDays is zero for today', () => {
    expect(scoreEmail({
      date: new Date(),
      subject: 'hi',
      rawSnippet: 'hello',
    })).toBe(0)
  })

  it('ageDays = 3 for 3-day-old email', () => {
    const three = new Date(Date.now() - 3 * day)
    expect(scoreEmail({
      date: three,
      subject: 'hi',
      rawSnippet: 'hello',
    })).toBe(3)
  })

  it('adds 2 for deadline keyword in subject', () => {
    expect(scoreEmail({
      date: new Date(),
      subject: 'Invoice due 25 Apr',
      rawSnippet: 'pay soon',
    })).toBe(2)
  })

  it('adds 2 for deadline keyword in snippet', () => {
    expect(scoreEmail({
      date: new Date(),
      subject: 'hi',
      rawSnippet: 'this is overdue',
    })).toBe(2)
  })

  it('adds 1 for dollar amount', () => {
    expect(scoreEmail({
      date: new Date(),
      subject: 'Bill',
      rawSnippet: 'Amount: $240 payable',
    })).toBe(1)
  })

  it('sums age + deadline + dollar', () => {
    const three = new Date(Date.now() - 3 * day)
    expect(scoreEmail({
      date: three,
      subject: 'Electricity due 25 Apr $240',
      rawSnippet: 'see attached',
    })).toBe(3 + 2 + 1)
  })

  it('treats null date as zero age', () => {
    expect(scoreEmail({
      date: null,
      subject: 'hi',
      rawSnippet: 'hello',
    })).toBe(0)
  })

  it('treats null subject + snippet as empty text', () => {
    expect(scoreEmail({
      date: new Date(),
      subject: null,
      rawSnippet: null,
    })).toBe(0)
  })
})
