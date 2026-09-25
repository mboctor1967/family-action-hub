---
Feature: Hub financials decoupling (P3)
Date: 2026-09-25
Tier: HIGH (score 12; see sizing)
Status: SIGNED OFF 2026-09-25 (code is gated on "P2 passed")
Target release: v0.7.0
App version at last update: v0.6.0
---

# Hub financials decoupling (P3)

## Sign-off (2026-09-25)
- Signed off by Maged, with DEC-1 = A and DEC-4 = yes.
- Reviewed from the downstream side by the boctor-financials session: verdict **GO**. It found 3 corrections and 2 notes, all applied. Its answers are in `docs/review/2026-09-25-boctor-financials-response.md`. It also shipped its own `tablesFilter` (`a240f11`) and refreshed the stale orca checkout.
- Post-deploy AC-007 checks: message the boctor-financials session, which runs its 4 checks against `8a285d1` and reports the diff.

## Sizing
| Factor | Finding | Score |
|---|---|---|
| Schema | 14 table definitions removed from `schema.ts` (definitions only; no DB change) | +2 |
| APIs | 43 financial routes and 2 settings routes removed | +2 |
| Cross-domain | Financials, Home, Settings, WhatsApp, auth | +2 |
| Files | About 150 | +2 |
| New UI | One link card | +1 |
| New behaviour | WhatsApp money commands retire; home cards change | +1 |
| ACs | 11 | +2 |
| Bug fix | No | 0 |
| **Total** | | **12 → HIGH** |

## Goal
The financial domain now lives in **boctor-financials** (extraction design `2026-08-31-boctor-financials-extraction.md`, phases P0–P2). The hub still carries a full, stale copy: about 150 files and 17k lines, 9 packages, 14 table definitions, and 13 home cards. Two apps editing the same financial tables is the drift risk the extraction exists to end. This removes every financial component from the hub, **without touching any data or boctor-financials itself**. The hub ends up with Tasks, Scan, Notion, WhatsApp and Settings, plus one link to boctor-financials.

**Also a safety gain.** `src/app/api/financials/accounts/[id]/route.ts` can today **DELETE** rows from `financial_transactions`, `financial_statements` and `financial_accounts`: another app's live data, reachable from the hub. Wave 4 retires it, along with every other hub write path into financial tables.

**Gate:** no code is removed until Maged confirms **"P2 passed"**: boctor-financials used exclusively, including one full FY2025-26 tax-prep export compared with the hub's.

## User stories
- US-001: As Maged, the hub shows one "Boctor Financials ↗" card, so there is one place for money.
- US-002: As Maged, I can trust that nothing in the hub can change the financial data.
- US-003: As Maged, boctor-financials keeps working exactly as before throughout.
- US-004: As Maged, the hub builds faster and asks Google only for the access it uses.

## Key decisions

| ID | Decision | Status |
|---|---|---|
| DEC-1 | WhatsApp `spend` / `balance` / `recent` commands are **removed** | **Chosen: A (user, 2026-09-25)** |
| DEC-2 | Tables stay in the DB; only the hub's *definitions* go | Note |
| DEC-3 | 13 home cards become 1 link card to `boctor-financials.vercel.app` | Note (extraction D4) |
| DEC-4 | The hub's Google sign-in drops `drive.readonly` | **Chosen: yes (user, 2026-09-25)** |
| DEC-5 | Order: consumers → code → definitions, so every branch builds green | Note |
| DEC-6 | Financial docs are archived, not deleted | Note |

### DEC-1: WhatsApp money commands
- Option A: remove them. The bot becomes Gmail-digest only and the hub reads no financial data.
- Option B: keep them. This leaves a hidden hub → financial-tables read that breaks silently when boctor-financials changes its schema.
- Option C: have boctor-financials expose an endpoint. The cleanest separation, but new work in the other app.
- **Chosen: A.** An unknown message now gets the digest help text instead.

**DEC-2 note.** The 14 tables (`financial_*`, `transaction_splits`, `parse_errors`, `ato_codes`, `invoice_*`, `invoices`, `export_jobs`) hold boctor-financials' live data. Several were extended by it: `property_id` was added to `financial_transactions` and `transaction_splits`. **No DROP, no migration.**
- `drizzle.config.ts` already limits the hub to its 18 tables via `tablesFilter` (v0.6.0).
- Removing the definitions also clears the one known side effect of that filter: a hub `drizzle-kit push` currently fails trying to re-create the financial tables.
- **Standing constraint: never remove `tablesFilter`, and never add a boctor-financials table to `HUB_TABLES`.**
  - After P3 the filter matters *more*, not less. An unfiltered hub push would see boctor-financials' 36 tables, none defined in the hub schema, and offer to drop them all, including the family's live tax data.
  - This rule is also pinned as a comment in `drizzle.config.ts`.

**DEC-4 note.** Drive was used only by statement and invoice ingest.
- Dropping the Drive scope leaves the hub with `openid email profile gmail.readonly`: one restricted scope instead of two.
- It costs one sign-out and sign-in, followed by **Reconnect Gmail**, which since v0.6.0 verifies the token.
- Existing tokens keep working until then.
- It ships as the last wave so it can be skipped without blocking the rest.

**DEC-5 note.** A branch that deletes code a live consumer still imports won't build. Order:
1. WhatsApp
2. Settings
3. Home
4. Delete the financial code
5. Schema definitions
6. Auth scope

Each wave is one domain (single-domain rule).

## Acceptance criteria
- AC-001 [MUST]: **Given** an allowlisted number sends `spend`, `balance`, `recent` or any unknown word, **When** the webhook handles it, **Then** the reply is the digest help text, and no query touches a financial table. Digest replies and `scan` keep working. Risk: LOW
- AC-002 [MUST]: **Given** Settings is open, **When** it renders, **Then** there is no AI-ATO cost panel, and `/api/settings/ai-cost-estimate` and `/api/settings/ai-claude-toggle` no longer exist. The Gmail, WhatsApp and Missed-emails cards are unchanged. Risk: LOW
- AC-003 [MUST]: **Given** the home page, **When** an admin opens it, **Then** it shows one "Boctor Financials ↗" card linking to `https://boctor-financials.vercel.app` (new tab), runs no financial queries, and the dead "Duplicate Detection" card is gone. Risk: LOW
- AC-004 [MUST]: **Given** a signed-in admin, **When** they open any `/financials/*` page or call `/api/financials/*`, **Then** the result is 404. Risk: LOW
- AC-005 [MUST]: **Given** the hub after P3, **When** it is built and tested, **Then** `npm run build`, `tsc` and the full suite pass. `grep -rni financ src` matches only the link card and the boundary test. This is extraction AC-006. Risk: MED
- AC-006 [MUST]: **Given** `schema.ts`, **When** it is inspected, **Then** none of the 14 financial tables is defined, the boundary test asserts that, and `drizzle-kit pull` through the filter still shows exactly the 18 hub tables. Risk: MED
- AC-007 [MUST]: **Given** boctor-financials and its committed pre-severance baseline (`docs/review/2026-09-25-pre-severance-baseline.md`, commit `8a285d1` in that repo), **When** the hub release is deployed, **Then** four checks, run (not modified) in the boctor-financials repo, match the baseline:
  - `parity-check.mts`: 7,174 transactions · 2023-06-14 → 2026-09-09 · net $320,008.47
  - `entity-model-acceptance.mts`: AC-E1..E7, including 36 owned tables and 0 cross-cluster FKs
  - `tax-pack-acceptance.mts`: AC-TP9
  - `npm test`: 1,371 at the baseline, **1,372 as of boctor-financials v0.39.1**. v0.39.1 only changed drizzle config, one test and version files, with no data path, so the figures above are unaffected

  These cover all 36 owned tables at value level; a row count cannot see a changed amount or category. boctor-financials must also still sign in and show Spending FY2025-26, and its repo is untouched. Risk: HIGH
- AC-008 [MUST]: **Given** `package.json`, **When** P3 ships, **Then** `@react-pdf/renderer`, `@vercel/blob`, `jszip`, `p-limit`, `papaparse`, `@types/papaparse`, `pdf-parse`, `recharts`, `tesseract.js` and `xlsx` are gone, with no import left. Risk: LOW
- AC-009 [SHOULD]: **Given** a fresh sign-in, **When** Auth.js stores the grant, **Then** `accounts.scope` has no Drive scope, and Reconnect plus Scan succeed. Risk: MED
- AC-010 [SHOULD]: **Given** the Vercel hub project, **When** P3 is live, **Then** `GDRIVE_FINANCIALS_FOLDER_ID`, `FINANCIAL_PARSE_MODEL` and `BLOB_READ_WRITE_TOKEN` are removed from **the hub project only**. The Blob store itself is **not** deleted. Risk: MED
- AC-011 [SHOULD]: **Given** the docs, **When** P3 ships:
  - financial briefs, `docs/domains/financials.md`, `invoices.md` and the ATO reference workbook are under `docs/archive/financials/`;
  - `docs/domains/_README.md` no longer routes financial work to the hub;
  - CLAUDE.md's domain list drops Financials.

  Risk: LOW

## Out of scope
- Any DB change: no DROP, no data deletion. Leftover hub `app_settings` rows (`ai_claude_enabled_ato`, `ai_pdf_parse_enabled`, `tax_pack_salary_accounts`) stay; they are harmless.
- Six further tables are owned by boctor-financials: `wfh_days`, `vehicle_journeys`, `vehicles`, `financial_documents`, `category_rules`, `receipts`. This was confirmed 2026-09-25 against its `ownership.test.ts`, which asserts 36 owned tables. The hub never touches them. (An earlier hub note called them unowned; it came from a stale checkout at v0.8.1.)
- Any change to the boctor-financials repo.
- Retiring the stale `family-action-hub-whatsapp` worktree. That is a separate chore.

## Assumptions
- ASSUMPTION-001: boctor-financials does not depend on hub code, hub routes or hub-only tables. It was verified 2026-09-25 by grepping its source: no hub tables, no WhatsApp. Impact if wrong: AC-007 fails, so the release is rolled back.
- ASSUMPTION-002: the Vercel Blob store is either shared with boctor-financials or unused by the hub. Removing the hub's env var never deletes blobs either way. Impact if wrong: none to data.
- ASSUMPTION-003: `test/data/05-versions-space.pdf` exists only for `pdf-parse`'s import-time self-test. Impact if wrong: build error, caught in wave 4.

## Schema changes
Definitions only. `src/lib/db/schema.ts` loses:
- the 14 `pgTable` blocks: `financialCategories`, `financialSubcategories`, `financialEntities`, `financialAccounts`, `financialStatements`, `financialTransactions`, `transactionSplits`, `financialAssumptions`, `parseErrors`, `atoCodes`, `invoiceTags`, `exportJobs`, `invoiceSuppliers`, `invoices`;
- their `relations()`;
- any enum used only by them.

**No SQL runs.** Rollback is `git revert`.

## API changes
Removed:
- `/api/financials/**`, 43 route files
- `/api/settings/ai-cost-estimate`
- `/api/settings/ai-claude-toggle`

Nothing is added.

## Implementation tasks
All waves are gated on "P2 passed". Work in the Orca checkout, port 3000.

### Wave 1: WhatsApp (`refactor/whatsapp/remove-money-commands`)
- [x] **T-1** [S]: delete `commands.ts`, `formatters.ts` and `parse.ts` with their tests. The webhook's fall-through replies with the digest help text. Update the home "WhatsApp Bot" card copy if it lists the commands · AC-001 · TC-001

### Wave 2: Settings (`refactor/settings/remove-ai-ato-panel`)
- [x] **T-2** [S]: delete `components/settings/ai-cost-panel.tsx` and the `ai-cost-estimate` and `ai-claude-toggle` routes. Remove `setClaudeAtoEnabled` from `lib/app-settings.ts`. `isClaudeAtoEnabled` stays until T-4, because the tax-export bundler still imports it. `getSetting`/`setSetting` stay permanently (used by the digest since v0.6.0) · AC-002 · TC-002

### Wave 3: Home (`refactor/home-shell/financials-link-card`)
- [x] **T-3** [M]: in `app/(dashboard)/page.tsx`, remove the 16 financial queries, the 13 financial cards and the dead Duplicate card. Add one external NavCard to boctor-financials · AC-003 · TC-003
  - Also removed the disabled "Vehicle Logbook – Coming soon" card: the vehicle logbook lives in boctor-financials (`vehicles`, `vehicle_journeys`).

### Wave 4: Delete (`refactor/financials/delete-from-hub`)
- [x] **T-4** [M]: delete:
  - `app/(dashboard)/financials/`, `app/api/financials/`, `components/financials/` and `lib/financials/`
  - `lib/gdrive/`, `lib/assumptions.ts`, `lib/gmail/search.ts` and `types/financials.ts`
  - `isClaudeAtoEnabled` and its key constant from `lib/app-settings.ts`, now that the bundler is gone
  - the financial one-off scripts: `src/scripts/*` (36) and `scripts/{ai-categorize-unclassified,dedupe-transactions,migrate-txn-fingerprint}.ts`, `scripts/build-phase-f-ato-workbook.py`, `scripts/sever-export-jobs-fk.sql`
  - `test/data/` and `src/types/pdf-parse.d.ts` (both existed only for `pdf-parse`)
  - The financial-data claims on the public `/privacy` and `/terms` pages. Google's consent screen links to them, so they must stay accurate

  AC-004, AC-005 · TC-004, TC-005
- [x] **T-5** [S]: uninstall the 10 packages · AC-008 · TC-008
- [x] **T-6** [S]: archive the docs; update `docs/domains/_README.md`, CLAUDE.md and home-shell/settings domain docs · AC-011

### Wave 5: Schema (`schema/remove-financial-definitions`)
- [x] **T-7** [M]: remove the 14 definitions and their relations. Rewrite `boundary.test.ts` to assert none is defined.
  - Then switch `HUB_TABLES` from a hand-kept list to one **derived from the schema**: `Object.values(schema)` filtered with `is(v, PgTable)`, mapped to `getTableName`. This matches boctor-financials `a240f11`, so a new hub table is protected automatically.
  - Add a test that the filter equals the 18 hub tables. This is only safe after the financial definitions are gone; derived today, it would include them.
  - Verify with `drizzle-kit pull` into scratch.

  AC-006 · TC-006

### Wave 6: Auth (`chore/auth/drop-drive-scope`), SHOULD. DEC-4 confirmed
- [ ] **T-8** [S]: remove `drive.readonly` from `auth.ts` scopes and fix the comment at `auth.ts:46` · AC-009 · TC-009

### Release and post-deploy
- [ ] **T-9**: after the hub deploy, the boctor-financials session runs its four baseline checks (parity-check, entity-model-acceptance, tax-pack-acceptance, `npm test`) and compares them with `8a285d1`. The hub session requests it via cross-session message and does not run anything in that repo itself · AC-007 · TC-007
- [ ] **T-10**: Maged removes 3 env vars from the hub Vercel project only · AC-010 · TC-010

## Test cases
- TC-001 [AUTO] AC-001: webhook test. `spend` → digest help reply; no db call against financial tables. Existing digest-reply and scan tests stay green.
- TC-002 [AUTO+MANUAL] AC-002: the suite is green without the panel and routes. Settings shows no AI-ATO panel.
- TC-003 [MANUAL] AC-003: the home page shows one Boctor Financials card, it opens boctor-financials in a new tab, and there are no financial numbers on the page.
- TC-004 [MANUAL] AC-004: `/financials/spending` returns 404 when signed in.
- TC-005 [AUTO] AC-005: build, tsc and suite pass. `grep -rni financ src` shows only the allowed hits.
- TC-006 [AUTO] AC-006: `boundary.test.ts` passes. `drizzle-kit pull` into scratch lists exactly the 18 hub tables.
- TC-007 [SCRIPT+MANUAL] AC-007: all four baseline checks match `8a285d1` exactly. Sign in to boctor-financials and open Spending FY2025-26.
- TC-008 [AUTO] AC-008: `package.json` has none of the 10 packages, and the build passes.
- TC-009 [MANUAL] AC-009: sign out and in, Reconnect Gmail, Scan now succeeds, and `accounts.scope` has no Drive. **Then open the boctor-financials Inbox and confirm a document preview still loads.** Both apps hold separate grants on the same OAuth client, so the hub's re-consent should not touch its Drive access, but this proves it.
- TC-010 [MANUAL] AC-010: Vercel hub project env list, checked by Maged.

## Cross-domain impact
- Financials is removed from the hub.
- Home, Settings and WhatsApp are edited.
- The auth scope shrinks (DEC-4).
- Shared schema definitions shrink; the DB is unchanged.
- Env vars: 3 removed from the hub.
- boctor-financials: none, verified by AC-007.

## Rollback
`git revert` the release; Vercel redeploys. No data or schema changed, so nothing else is needed. If DEC-4 shipped, a revert restores the Drive scope on the next sign-in.

## Release notes
### User-facing
- (filled at release)
### QA
- (filled at release)
### Technical
- (filled at release)
