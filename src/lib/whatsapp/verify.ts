import crypto from 'node:crypto'

export function verifySignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
): boolean {
  if (!header || !header.startsWith('sha256=')) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
