import { describe, it, expect } from 'vitest'
import { parseDigestReply } from '../digest-reply-parser'

describe('parseDigestReply', () => {
  it('parses "task 1,3,5"', () => {
    expect(parseDigestReply('task 1,3,5', 7)).toEqual({
      confirm: [1, 3, 5], reject: [], help: false,
      outOfRange: [], conflicts: [],
    })
  })

  it('parses "task 1-5"', () => {
    expect(parseDigestReply('task 1-5', 7)).toEqual({
      confirm: [1, 2, 3, 4, 5], reject: [], help: false,
      outOfRange: [], conflicts: [],
    })
  })

  it('parses "task all"', () => {
    expect(parseDigestReply('task all', 3)).toEqual({
      confirm: [1, 2, 3], reject: [], help: false,
      outOfRange: [], conflicts: [],
    })
  })

  it('parses "done" → reject all', () => {
    expect(parseDigestReply('done', 4)).toEqual({
      confirm: [], reject: [1, 2, 3, 4], help: false,
      outOfRange: [], conflicts: [],
    })
  })

  it('parses "task 1 reject 2,4"', () => {
    expect(parseDigestReply('task 1 reject 2,4', 5)).toEqual({
      confirm: [1], reject: [2, 4], help: false,
      outOfRange: [], conflicts: [],
    })
  })

  it('parses "task 1,3 reject rest"', () => {
    expect(parseDigestReply('task 1,3 reject rest', 5)).toEqual({
      confirm: [1, 3], reject: [2, 4, 5], help: false,
      outOfRange: [], conflicts: [],
    })
  })

  it('parses mixed range + list', () => {
    expect(parseDigestReply('task 1-3,5', 7)).toEqual({
      confirm: [1, 2, 3, 5], reject: [], help: false,
      outOfRange: [], conflicts: [],
    })
  })

  it('parses "help"', () => {
    expect(parseDigestReply('help', 7)?.help).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(parseDigestReply('TASK 1,3', 5)?.confirm).toEqual([1, 3])
    expect(parseDigestReply('Help', 5)?.help).toBe(true)
    expect(parseDigestReply('DONE', 3)?.reject).toEqual([1, 2, 3])
  })

  it('tolerates extra whitespace', () => {
    expect(parseDigestReply('  task   1 , 3  ', 5)?.confirm).toEqual([1, 3])
  })

  it('reports out-of-range positions and drops them from confirm/reject', () => {
    const out = parseDigestReply('task 1,21 reject 3,50', 10)
    expect(out?.confirm).toEqual([1])
    expect(out?.reject).toEqual([3])
    expect(out?.outOfRange?.sort((a, b) => a - b)).toEqual([21, 50])
  })

  it('reports conflicts when same position in both; confirm wins', () => {
    const out = parseDigestReply('task 1,3 reject 1,5', 5)
    expect(out?.confirm).toEqual([1, 3])
    expect(out?.reject).toEqual([5])
    expect(out?.conflicts).toEqual([1])
  })

  it('returns null for unrecognised text', () => {
    expect(parseDigestReply('blah blah', 5)).toBeNull()
    expect(parseDigestReply('', 5)).toBeNull()
    expect(parseDigestReply('task', 5)).toBeNull() // empty selector
  })

  it('dedupes repeated positions', () => {
    expect(parseDigestReply('task 1,1,3,3', 5)?.confirm).toEqual([1, 3])
  })
})
