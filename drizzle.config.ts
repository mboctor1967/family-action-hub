import { defineConfig } from 'drizzle-kit'
import { is, getTableName } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import * as schema from './src/lib/db/schema'

/**
 * The Neon database is shared with boctor-financials, which owns 36 tables there
 * (financial_*, transaction_splits, invoices, bf_*, property_*, asset_*, vehicles,
 * wfh_days, receipts and more). drizzle-kit treats every table it can see but the
 * schema does not define as one to drop, so an unfiltered `push` from here would
 * offer to drop all of them — the family's live financial and tax data.
 *
 * The filter is derived from the hub schema, so a new hub table is covered the
 * moment it is defined. boundary.test.ts pins it to the 18 hub tables and fails if
 * a boctor-financials table ever appears in it. Production changes still go
 * through guarded SQL scripts in scripts/.
 *
 * NEVER remove tablesFilter. NEVER add a boctor-financials table to the hub schema.
 */
const HUB_TABLES = (Object.values(schema) as unknown[])
  .filter((v): v is PgTable => is(v, PgTable))
  .map((t) => getTableName(t))

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  tablesFilter: HUB_TABLES,
})
