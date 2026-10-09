/**
 * Where the daily digest is delivered.
 *
 * Added 2026-10-10 because WhatsApp stopped delivering entirely: every send since
 * 4 October was rejected by Meta with `131047 Re-engagement message` — a free-form
 * message outside the 24-hour customer-service window. Unblocking that needs an
 * approved template and a WhatsApp Business Account assigned to the System User,
 * both inside Meta and both outside this codebase. Email has no such window.
 *
 * See docs/features/2026-10-10-digest-channel-email.md
 */
export const DIGEST_CHANNELS = ['whatsapp', 'email', 'both'] as const

export type DigestChannel = (typeof DIGEST_CHANNELS)[number]

/** `app_settings` key holding the channel. */
export const DIGEST_CHANNEL_KEY = 'digest_channel'

/** The channel used when nothing is stored, or when what is stored is unreadable. */
export const DEFAULT_DIGEST_CHANNEL: DigestChannel = 'both'

/**
 * Coerce an unknown stored value to a channel.
 *
 * Deliberately total and deliberately lenient in one direction only: anything we do not
 * recognise becomes `both`. A corrupt or hand-edited setting must never be the reason a
 * digest is silently not delivered — over-delivering is recoverable, silence is what we
 * are fixing.
 */
export function parseChannel(value: unknown): DigestChannel {
  return (DIGEST_CHANNELS as readonly string[]).includes(value as string)
    ? (value as DigestChannel)
    : DEFAULT_DIGEST_CHANNEL
}

/** True when this channel includes a WhatsApp send. */
export function wantsWhatsApp(channel: DigestChannel): boolean {
  return channel === 'whatsapp' || channel === 'both'
}

/** True when this channel includes an email send. */
export function wantsEmail(channel: DigestChannel): boolean {
  return channel === 'email' || channel === 'both'
}

/*
 * Storage accessors below. `@/lib/app-settings` reaches `@/lib/db`, which calls `neon()`
 * at module scope and throws without DATABASE_URL — so it is imported lazily, inside the
 * functions. That keeps everything above this line importable by a unit test with no
 * database, which is the whole point of having the rules as pure functions.
 */

/** Read the configured channel. Never throws — a storage failure falls back to the default. */
export async function getDigestChannel(): Promise<DigestChannel> {
  try {
    const { getSetting } = await import('@/lib/app-settings')
    return parseChannel(await getSetting<string>(DIGEST_CHANNEL_KEY))
  } catch (err) {
    console.error('[digest-channel] could not read the setting, defaulting', err instanceof Error ? err.message : err)
    return DEFAULT_DIGEST_CHANNEL
  }
}

/** Persist the channel. The caller is responsible for having validated it. */
export async function setDigestChannel(channel: DigestChannel, updatedBy?: string): Promise<void> {
  const { setSetting } = await import('@/lib/app-settings')
  await setSetting(DIGEST_CHANNEL_KEY, channel, updatedBy)
}
