import { defineConfig } from 'drizzle-kit'

/**
 * The Neon database is shared with boctor-financials, which owns the financial_*,
 * bf_*, property_* and asset_* tables. drizzle-kit treats every table it can see
 * but the schema does not define as one to drop, so without this list a `push`
 * from here would propose dropping the other app's tables — and columns it added,
 * such as financial_transactions.property_id.
 *
 * Only hub-owned tables are listed. The 14 financial tables are deliberately left
 * out even though src/lib/db/schema.ts still defines them until the P3 cleanup:
 * they belong to boctor-financials now (docs/features/2026-08-31-boctor-financials-extraction.md).
 * Until P3, a `push` from here will fail trying to re-create them — which is the
 * safe failure. Production changes go through guarded SQL scripts in scripts/.
 *
 * NEVER remove tablesFilter. NEVER add a boctor-financials table to HUB_TABLES.
 * The two apps share one Neon instance and boctor-financials owns 36 tables here;
 * this filter is the only guard against a hub push offering to drop them.
 */
const HUB_TABLES = [
  'profiles', 'accounts', 'sessions', 'verification_tokens', 'app_settings',
  'gmail_accounts', 'topics', 'emails_scanned', 'tasks', 'comments', 'subtasks',
  'ai_feedback', 'ai_skill_versions', 'scan_runs', 'notion_dedupe_reports',
  'whatsapp_processed_messages', 'whatsapp_digest_snapshots', 'whatsapp_outbound_messages',
]

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  tablesFilter: HUB_TABLES,
})
