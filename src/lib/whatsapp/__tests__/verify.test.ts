import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verifySignature } from '../verify'

const SECRET = 'test-secret'
const BODY = '{"hello":"world"}'
const sign = (body: string, secret: string) =>
  'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')

describe('verifySignature', () => {
  it('accepts a valid signature', () => {
    expect(verifySignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true)
  })
  it('rejects a wrong signature', () => {
    expect(verifySignature(BODY, sign(BODY, 'other'), SECRET)).toBe(false)
  })
  it('rejects missing header', () => {
    expect(verifySignature(BODY, null, SECRET)).toBe(false)
  })
  it('rejects malformed header', () => {
    expect(verifySignature(BODY, 'nope', SECRET)).toBe(false)
  })
})
