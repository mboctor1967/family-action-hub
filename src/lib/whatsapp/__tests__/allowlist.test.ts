import { describe, it, expect, beforeEach } from 'vitest'
import { getAllowlist, isAllowed, normalisePhone } from '../allowlist'

describe('normalisePhone', () => {
  it('strips all non-digits', () => {
    expect(normalisePhone('+61412408587')).toBe('61412408587')
    expect(normalisePhone('+61 412 408 587')).toBe('61412408587')
    expect(normalisePhone('(+61) 412-408-587')).toBe('61412408587')
  })
})

describe('getAllowlist', () => {
  beforeEach(() => {
    delete process.env.WHATSAPP_ALLOWED_NUMBERS
  })

  it('returns [] when env var missing', () => {
    expect(getAllowlist()).toEqual([])
  })

  it('splits on commas, trims whitespace, drops empty entries, normalises', () => {
    process.env.WHATSAPP_ALLOWED_NUMBERS = '+61412408587, +61402149544 ,'
    expect(getAllowlist()).toEqual(['61412408587', '61402149544'])
  })
})

describe('isAllowed', () => {
  beforeEach(() => {
    process.env.WHATSAPP_ALLOWED_NUMBERS = '+61412408587,+61402149544'
  })

  it('matches after normalising both sides', () => {
    expect(isAllowed('+61412408587')).toBe(true)
    expect(isAllowed('61412408587')).toBe(true)
    expect(isAllowed('61402149544')).toBe(true)
  })

  it('rejects non-allowlisted numbers', () => {
    expect(isAllowed('+61499999999')).toBe(false)
  })
})
