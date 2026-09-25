/** App settings helper — key-value store for shared admin configuration. */

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
        value: value as unknown,
        updatedAt: new Date(),
        updatedBy: updatedBy ?? null,
      })
      .where(eq(appSettings.key, key))
  } else {
    await db.insert(appSettings).values({
      key,
      value: value as unknown,
      updatedBy: updatedBy ?? null,
    })
  }
}
