/**
 * Phase F1 — Backfill AI-suggested ATO codes for existing transactions.
 *
 * Run once after migration:
 *   node --env-file=.env.local --import tsx src/scripts/backfill-ato-proposals.ts
 *
 * Idempotent: only writes rows where the suggestion columns are currently NULL.
 */

import { db } from '@/lib/db'
import {
  financialTransactions,
  financialSubcategories,
  financialAccounts,
  financialEntities,
} from '@/lib/db/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'
import { proposeAtoCodes, type EntityType } from '@/lib/financials/ato-proposer'

const BATCH_SIZE = 500

async function main() {
  console.log('Backfilling AI-suggested ATO codes for existing transactions...')

  // Fetch all subcategories into memory (small table)
  const allSubcats = await db.select().from(financialSubcategories)
  const subcatByName = new Map(allSubcats.map(s => [s.name, s]))

  // Fetch all entities so we can derive type by account
  const entities = await db
    .select({ accountId: financialAccounts.id, entityType: financialEntities.type })
    .from(financialAccounts)
    .leftJoin(financialEntities, eq(financialAccounts.entityId, financialEntities.id))
  const entityTypeByAccount = new Map<string, EntityType>(
    entities.map(e => [e.accountId, (e.entityType ?? null) as EntityType])
  )

  // Process in batches
  let offset = 0
  let processed = 0
  let updated = 0

  while (true) {
    const batch = await db
      .select({
        id: financialTransactions.id,
        merchantName: financialTransactions.merchantName,
        descriptionRaw: financialTransactions.descriptionRaw,
        amount: financialTransactions.amount,
        category: financialTransactions.category,
        subcategory: financialTransactions.subcategory,
        accountId: financialTransactions.accountId,
      })
      .from(financialTransactions)
      .where(
        and(
          isNull(financialTransactions.aiSuggestedAtoCodePersonal),
          isNull(financialTransactions.aiSuggestedAtoCodeCompany)
        )
      )
      .limit(BATCH_SIZE)
      .offset(offset)

    if (batch.length === 0) break

    for (const txn of batch) {
      processed++
      const subcat = txn.subcategory ? subcatByName.get(txn.subcategory) : null
      const entityType = txn.accountId ? entityTypeByAccount.get(txn.accountId) ?? null : null

      const proposal = proposeAtoCodes(
        {
          merchantName: txn.merchantName,
          descriptionRaw: txn.descriptionRaw,
          amount: txn.amount,
          category: txn.category,
        },
        subcat
          ? { name: subcat.name, atoCodePersonal: subcat.atoCodePersonal, atoCodeCompany: subcat.atoCodeCompany }
          : null,
        entityType
      )

      // Only update if at least one field would be populated
      if (proposal.aiPersonal !== null || proposal.aiCompany !== null) {
        await db
          .update(financialTransactions)
          .set({
            aiSuggestedAtoCodePersonal: proposal.aiPersonal,
            aiSuggestedAtoCodeCompany: proposal.aiCompany,
          })
          .where(eq(financialTransactions.id, txn.id))
        updated++
      }
    }

    console.log(`  Processed ${processed}, updated ${updated}`)

    if (batch.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }

  // Final counts
  const [personalCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(financialTransactions)
    .where(sql`${financialTransactions.aiSuggestedAtoCodePersonal} is not null`)
  const [companyCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(financialTransactions)
    .where(sql`${financialTransactions.aiSuggestedAtoCodeCompany} is not null`)

  console.log('\nDone.')
  console.log(`  Total txns with personal suggestions: ${personalCount?.n ?? 0}`)
  console.log(`  Total txns with company suggestions:  ${companyCount?.n ?? 0}`)
  process.exit(0)
}

main().catch(err => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
