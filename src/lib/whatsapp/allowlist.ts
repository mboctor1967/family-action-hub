export function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function getAllowlist(): string[] {
  const raw = process.env.WHATSAPP_ALLOWED_NUMBERS ?? ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalisePhone)
}

export function isAllowed(phone: string): boolean {
  const normalised = normalisePhone(phone)
  return getAllowlist().includes(normalised)
}
