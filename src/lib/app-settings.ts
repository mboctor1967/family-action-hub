/**
 * App settings helper — key-value store for shared admin configuration.
 *
 * Phase F1 — Tax Prep / Accountant Pack
 */

import { db } from '@/lib/db'
import { appSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
  if (rows.length === 0) return null
  return rows[0].value as T
}

export async function setSetting<T = unknown>(
  key: string,
  value: T,
  updatedBy?: string
): Promise<void> {
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
  if (existing.length > 0) {
    await db
      .update(appSettings)
      .set({
        value: value as any,
        updatedAt: new Date(),
        updatedBy: updatedBy ?? null,
      })
      .where(eq(appSettings.key, key))
  } else {
    await db.insert(appSettings).values({
      key,
      value: value as any,
      updatedBy: updatedBy ?? null,
    })
  }
}

// Typed convenience functions
const CLAUDE_ATO_KEY = 'ai_claude_enabled_ato'

export async function isClaudeAtoEnabled(): Promise<boolean> {
  const value = await getSetting<boolean>(CLAUDE_ATO_KEY)
  return value === true
}

export async function setClaudeAtoEnabled(enabled: boolean, updatedBy?: string): Promise<void> {
  await setSetting(CLAUDE_ATO_KEY, enabled, updatedBy)
}
