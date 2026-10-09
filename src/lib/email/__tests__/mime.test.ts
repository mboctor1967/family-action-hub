import { describe, it, expect } from 'vitest'
import { buildMimeMessage, toBase64Url, GmailScopeError } from '@/lib/email/mime'

/**
 * TC-004 / AC-006.
 *
 * The user's standing rule: an email carries real HTML in the HTML part and a plain-text
 * version alongside it — never markdown in the body, because no mail client renders it.
 * That means multipart/alternative, every time.
 */
describe('buildMimeMessage', () => {
  const args = {
    to: ['a@example.com', 'b@example.com'],
    from: 'sender@example.com',
    subject: 'Gmail digest - 10 Oct 2026',
    text: 'plain version',
    html: '<p>html version</p>',
  }

  it('is multipart/alternative with a boundary that is actually used', () => {
    const mime = buildMimeMessage(args)
    const boundary = mime.match(/boundary="([^"]+)"/)?.[1]
    expect(boundary).toBeTruthy()
    // Opening delimiter for each part, plus the closing delimiter.
    expect(mime.split(`--${boundary}\r\n`).length - 1).toBe(2)
    expect(mime).toContain(`--${boundary}--`)
  })

  it('carries both a text/plain and a text/html part, plain first', () => {
    const mime = buildMimeMessage(args)
    const plainAt = mime.indexOf('Content-Type: text/plain')
    const htmlAt = mime.indexOf('Content-Type: text/html')
    expect(plainAt).toBeGreaterThan(-1)
    expect(htmlAt).toBeGreaterThan(-1)
    // Least-capable part first: that is what multipart/alternative means.
    expect(plainAt).toBeLessThan(htmlAt)
    expect(mime).toContain('plain version')
    expect(mime).toContain('<p>html version</p>')
  })

  it('joins multiple recipients with a comma', () => {
    expect(buildMimeMessage(args)).toContain('To: a@example.com, b@example.com')
  })

  it('encodes the subject so a non-ASCII character cannot corrupt the header', () => {
    const mime = buildMimeMessage({ ...args, subject: 'Digest — 3 items' })
    expect(mime).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/)
    expect(mime).not.toContain('Subject: Digest — 3 items')
  })

  it('uses CRLF line endings throughout', () => {
    const mime = buildMimeMessage(args)
    // A bare LF in a header breaks the message for strict servers.
    expect(mime.replace(/\r\n/g, '')).not.toContain('\n')
  })
})

describe('toBase64Url', () => {
  it('is URL-safe and unpadded, as the Gmail API requires', () => {
    const encoded = toBase64Url('a?b>c~dÿ'.repeat(5))
    expect(encoded).not.toMatch(/[+/=]/)
  })

  it('round-trips', () => {
    const original = 'Subject: test\r\n\r\nBody with = and / and +'
    const back = Buffer.from(
      toBase64Url(original).replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8')
    expect(back).toBe(original)
  })
})

/**
 * TC-005 / AC-010. The grant is `gmail.readonly` until someone re-consents, so the
 * first real failure mode is a 403 from Gmail. It must say what to do, not just fail.
 */
describe('GmailScopeError', () => {
  it('names the missing scope and the remedy', () => {
    const err = new GmailScopeError()
    expect(err.message).toContain('gmail.send')
    expect(err.message.toLowerCase()).toContain('reconnect')
    expect(err).toBeInstanceOf(Error)
  })
})
