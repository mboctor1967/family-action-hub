import { describe, it, expect } from 'vitest'
import { parseCommand } from '../parse'

describe('parseCommand', () => {
  it('extracts bare command', () => {
    expect(parseCommand('spend')).toBe('spend')
  })
  it('lowercases', () => {
    expect(parseCommand('SPEND')).toBe('spend')
  })
  it('trims whitespace', () => {
    expect(parseCommand('  spend  ')).toBe('spend')
  })
  it('strips @mention prefix', () => {
    expect(parseCommand('@FamilyBot spend')).toBe('spend')
  })
  it('strips multiple leading @mentions', () => {
    expect(parseCommand('@bot @other spend')).toBe('spend')
  })
  it('takes only the first word', () => {
    expect(parseCommand('@bot spend last month')).toBe('spend')
  })
  it('returns empty string for empty input', () => {
    expect(parseCommand('')).toBe('')
    expect(parseCommand('   ')).toBe('')
    expect(parseCommand('@bot')).toBe('')
  })
})
