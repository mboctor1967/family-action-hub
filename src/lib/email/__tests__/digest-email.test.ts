import { describe, it, expect } from 'vitest'
import { renderDigestEmail } from '@/lib/email/digest-email'
import type { DigestItem, DigestStats } from '@/lib/whatsapp/digest-format'

const stats: DigestStats = {
  windowFromLabel: '03 Oct',
  windowToLabel: '10 Oct',
  totalEmails: 57,
  newEmails: 12,
  alreadyScanned: 45,
  actionableCount: 2,
}

const items: DigestItem[] = [
  {
    id: 'uuid-1',
    subject: 'Rates notice due 28 Oct',
    fromName: 'Brisbane City Council',
    fromAddress: 'rates@brisbane.qld.gov.au',
    gmailMessageId: 'msg-aaa',
    date: new Date('2026-10-08T03:00:00Z'),
  },
  {
    id: 'uuid-2',
    subject: null,
    fromName: null,
    fromAddress: null,
    gmailMessageId: 'msg-bbb',
    date: null,
  },
]

/** TC-006 / AC-005 — the email must lose nothing the WhatsApp digest carries. */
describe('renderDigestEmail', () => {
  const out = renderDigestEmail(items, { dateLabel: '10 Oct 2026', stats })

  it('names every item and links each one to Gmail', () => {
    expect(out.html).toContain('Rates notice due 28 Oct')
    expect(out.html).toContain('https://mail.google.com/mail/u/0/#all/msg-aaa')
    expect(out.html).toContain('https://mail.google.com/mail/u/0/#all/msg-bbb')
    expect(out.text).toContain('Rates notice due 28 Oct')
    expect(out.text).toContain('https://mail.google.com/mail/u/0/#all/msg-aaa')
  })

  it('survives an item with no subject, sender or date', () => {
    expect(out.html).toContain('(no subject)')
    expect(out.text).toContain('(no subject)')
  })

  it('carries the date label and the actionable count in the subject', () => {
    expect(out.subject).toContain('10 Oct 2026')
    expect(out.subject).toContain('2')
  })

  it('carries the same window stats as the WhatsApp digest', () => {
    for (const fragment of ['03 Oct', '10 Oct', '57']) {
      expect(out.text).toContain(fragment)
    }
  })

  it('styles inline only — Gmail strips <style> blocks', () => {
    expect(out.html).not.toMatch(/<style[\s>]/i)
    expect(out.html).toContain('style="')
  })

  it('escapes HTML in a subject so a crafted email cannot inject markup', () => {
    const nasty: DigestItem[] = [{
      ...items[0],
      subject: '<img src=x onerror="alert(1)">',
    }]
    const res = renderDigestEmail(nasty, { dateLabel: '10 Oct 2026', stats })
    expect(res.html).not.toContain('<img src=x')
    expect(res.html).toContain('&lt;img')
  })

  it('says so plainly when there is nothing to action', () => {
    const empty = renderDigestEmail([], {
      dateLabel: '10 Oct 2026',
      stats: { ...stats, actionableCount: 0 },
    })
    expect(empty.text.toLowerCase()).toContain('nothing')
    expect(empty.html.toLowerCase()).toContain('nothing')
  })
})
