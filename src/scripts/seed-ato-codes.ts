/**
 * Phase F1 — Seed ATO codes reference table + populate subcategory defaults.
 *
 * Run with:
 *   node --env-file=.env.local --import tsx src/scripts/seed-ato-codes.ts
 *
 * Idempotent — safe to re-run. Uses UPSERT semantics.
 */

import { db } from '@/lib/db'
import { atoCodes, financialSubcategories } from '@/lib/db/schema'
import { ALL_ATO_CODES, SUBCATEGORY_ATO_MAP } from '@/lib/financials/ato-codes'
import { eq, sql } from 'drizzle-orm'

async function seedAtoCodes() {
  console.log('Seeding ato_codes table...')
  let insertCount = 0
  let updateCount = 0

  for (const code of ALL_ATO_CODES) {
    const existing = await db.select().from(atoCodes).where(eq(atoCodes.code, code.code)).limit(1)
    if (existing.length > 0) {
      await db
        .update(atoCodes)
        .set({
          scope: code.scope,
          section: code.section,
          label: code.label,
          description: code.description ?? null,
          sortOrder: code.sortOrder,
          isInternalSubcode: code.isInternalSubcode ?? false,
          rollsUpTo: code.rollsUpTo ?? null,
        })
        .where(eq(atoCodes.code, code.code))
      updateCount++
    } else {
      await db.insert(atoCodes).values({
        code: code.code,
        scope: code.scope,
        section: code.section,
        label: code.label,
        description: code.description ?? null,
        sortOrder: code.sortOrder,
        isInternalSubcode: code.isInternalSubcode ?? false,
        rollsUpTo: code.rollsUpTo ?? null,
      })
      insertCount++
    }
  }
  console.log(`  ato_codes: ${insertCount} inserted, ${updateCount} updated`)
}

async function seedSubcategoryDefaults() {
  console.log('Populating subcategory ato_code_personal / ato_code_company defaults...')

  const subs = await db.select().from(financialSubcategories)
  let matched = 0
  let updated = 0
  let unmatched: string[] = []

  for (const sub of subs) {
    const mapping = SUBCATEGORY_ATO_MAP[sub.name]
    if (!mapping) {
      unmatched.push(sub.name)
      continue
    }
    matched++
    const changed =
      sub.atoCodePersonal !== (mapping.personal ?? null) ||
      sub.atoCodeCompany !== (mapping.company ?? null)
    if (changed) {
      await db
        .update(financialSubcategories)
        .set({
          atoCodePersonal: mapping.personal ?? null,
          atoCodeCompany: mapping.company ?? null,
        })
        .where(eq(financialSubcategories.id, sub.id))
      updated++
    }
  }

  console.log(`  subcategories: ${matched} mapped, ${updated} updated, ${unmatched.length} unmatched (expected — non-deductible categories)`)
  if (unmatched.length > 0 && unmatched.length < 40) {
    console.log(`  unmatched subcategories: ${unmatched.join(', ')}`)
  }
}

async function verify() {
  const totalCodes = await db.select({ n: sql<number>`count(*)` }).from(atoCodes)
  const personalCodes = await db.select({ n: sql<number>`count(*)` }).from(atoCodes).where(eq(atoCodes.scope, 'personal'))
  const companyCodes = await db.select({ n: sql<number>`count(*)` }).from(atoCodes).where(eq(atoCodes.scope, 'company'))
  const mappedSubs = await db
    .select({ n: sql<number>`count(*)` })
    .from(financialSubcategories)
    .where(sql`${financialSubcategories.atoCodePersonal} is not null or ${financialSubcategories.atoCodeCompany} is not null`)

  console.log('\nVerification:')
  console.log(`  Total ATO codes:     ${totalCodes[0].n}`)
  console.log(`  Personal codes:      ${personalCodes[0].n}`)
  console.log(`  Company codes:       ${companyCodes[0].n}`)
  console.log(`  Mapped subcategories: ${mappedSubs[0].n}`)
}

async function main() {
  try {
    await seedAtoCodes()
    await seedSubcategoryDefaults()
    await verify()
    console.log('\nDone.')
    process.exit(0)
  } catch (err) {
    console.error('Seed failed:', err)
    process.exit(1)
  }
}

main()
