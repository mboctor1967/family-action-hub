---
Feature: Phase F1 — Tax Prep / Accountant Pack
Date: 2026-04-06
Tier: HIGH
Status: SIGNED OFF
Target release: v0.1.2
App version at last update: v0.1.1
Condensed from: docs/archive/phase-f/{requirements, design, spec, plan} (SIGNED OFF 2026-04-06)
---

# Phase F1 — Tax Prep / Accountant Pack

## Goal

One-click accountant-ready export bundle for the annual 30 April deadline. Per entity (Personal, D3 Pty Ltd, Babyccino Pty Ltd), generate a full P&L report, transaction CSVs, assumptions snapshot, outstanding-items checklist, and supplier invoices — packaged as a single ZIP with one subfolder per entity.

**Split:** F1 (this brief) handles tax prep using Drive-folder invoice scanning. F2 (deferred to v0.2.0+) handles full Invoice Scanner integration and replaces the Drive-scan data source with a DB-backed scanner. F2 reuses F1's file/index contract — no rework.

## User stories

- **US-001** — As admin, I click "Generate Accountant Pack" for a FY and receive a single ZIP with everything the accountant needs, so I can email it on 30 April without manual assembly.
- **US-002** — As admin, I want AI-proposed personal + business ATO codes on every transaction at import time so data is tax-classified before export.
- **US-003** — As admin, I want the export to flag data-quality problems (uncategorised txns, missing ATO codes, coverage gaps, missing assumptions) before sending.
- **US-004** — As admin, I want each entity's report to be a full P&L (income + all expenses by ATO code) with deductibles highlighted.
- **US-005** — As categoriser (Maged/Mandy), I want ATO code proposals inline on the Categorise page beside existing category suggestions.
- **US-006** — As admin, I want supplier invoices in Drive bundled into the export automatically with an `invoices-index.csv` linking each file to a transaction.

## Key decisions

### Decisions summary

| # | Decision | Chosen |
|---|---|---|
| DEC-1 | ATO code scope | D-codes (Individual Return) + Item 6 codes (Company Return) |
| DEC-1b | Dual-code storage | Two columns on subcategories: `ato_code_personal` + `ato_code_company` |
| DEC-2 | Export bundle format | ZIP, one subfolder per entity |
| DEC-2b | Invoice source (F1) | Google Drive folder scan per entity (F2 deferred) |
| DEC-2c | Invoice embedding model | Flat `invoices/` folder + `invoices-index.csv` per entity (F1↔F2 contract) |
| DEC-3 | Report scope | Full P&L with deductibles highlighted |
| DEC-4 | Outstanding items | Data quality + coverage gaps + assumptions gaps |
| DEC-5 | GST handling | Graceful fallback to gross amount when `amount_ex_gst` is null |
| DEC-6 | ATO mapping workflow | Integrated into existing Categorise page, AI-proposed + user-confirmed (mirrors `category`/`aiSuggestedCategory`) |
| DEC-7 | Version milestone | Ship standalone as v0.1.2 |
| TD-1 | ATO reference data storage | DB table `ato_codes` + constants file in `src/lib/financials/ato-codes.ts` as build-time source |
| TD-2 | CSV library | `papaparse` |
| TD-3 | ZIP library | `jszip` |
| TD-4 | App settings storage | New `app_settings` key-value table (shared admin config) |
| TD-5 | Invoice tags storage | New `invoice_tags` table keyed by `gdrive_file_id` |
| TD-6 | Export jobs + temp ZIP storage | `export_jobs` table + Vercel Blob, 1-hour expiry |
| TD-7 | Rule-based ATO lookup | Subcategory default → entity-type routing → refinement rules (see Algorithms) |
| TD-8 | Drive folder scan scope | Shallow, files only, MIME-filtered, 500-file cap |

### Load-bearing notes

- **Entity routing:** transactions have no direct `entity_id`; join through `financial_accounts.entityId` to get entity type (`personal | business | trust`), then pick the personal or company ATO column.
- **Claude hybrid path:** rule-based is default and free. Claude is opt-in via Settings toggle, only called for ambiguous rows (where rule-based returned null). **User-toggleable + live cost estimate shown before toggling.**
- **PDF library:** `@react-pdf/renderer` (JSX components, server-safe, Vercel-friendly). Not puppeteer (bundle size) or pdf-lib (too low-level).

## Acceptance criteria

### Data model
- **AC-001 [MUST]** Subcategory dual-code columns exist: `ato_code_personal` + `ato_code_company` (both nullable text). Risk: LOW
- **AC-002 [MUST]** Transactions have four new columns: `ato_code_personal`, `ai_suggested_ato_code_personal`, `ato_code_company`, `ai_suggested_ato_code_company`. Risk: LOW
- **AC-003 [MUST]** Migration seeds `ato_codes` table (14 personal + 29 company = 43 rows) and populates subcategory defaults from `SUBCATEGORY_ATO_MAP`. Risk: LOW

### Ingest + backfill
- **AC-004 [MUST]** Given a new transaction via import pipeline, when ingest completes, then `ai_suggested_ato_code_*` columns are populated based on subcategory + account/entity context. Confirmed columns remain null until user reviews. Risk: MED
- **AC-005 [MUST]** Given F1 deployed to env with existing transactions, when migration runs, then every existing transaction has suggested columns populated. Risk: LOW

### Categorise page
- **AC-006 [MUST]** Given user on `/financials/categorize`, when they view a merchant row, then expanding the row shows AI-proposed personal + company ATO codes with accept/override buttons. Accept writes to the confirmed column, leaving the suggestion unchanged for audit. Risk: MED
- **AC-007 [SHOULD]** "Accept all AI" button writes category + personal ATO + company ATO for a merchant in one API call. Risk: LOW

### Tax Prep page + export
- **AC-008 [MUST]** `/financials/tax` shows FY selector (last 5 + current) and a list of all entities with txn counts per FY. "Generate Accountant Pack" button shown when at least one entity has data. Risk: LOW
- **AC-009 [MUST]** Clicking "Generate" produces a ZIP download named `Boctor-Accountant-Pack-FY{yy-yy}.zip` with one subfolder per entity containing reports, CSVs, and invoices. Risk: MED
- **AC-010 [MUST]** Each entity subfolder contains: `{Entity}-Report.pdf`, `transactions.csv`, `expenses-by-ato-code.csv`, `income-summary.csv`, `assumptions-applied.csv`, `outstanding-items.csv`, `invoices/` folder, `invoices-index.csv`. Business entities additionally have `gst-summary.csv`. ZIP root has `00-Cover-Sheet.pdf` + `README.txt`. Risk: LOW
- **AC-011 [MUST]** Report shows every transaction in FY (full P&L), each tagged with ATO code or "Non-deductible / private". Totals split into deductible vs non-deductible. Risk: LOW
- **AC-012 [MUST]** GST fallback: null `amount_ex_gst` → use gross; cover sheet notes "Phase E pending". Populated `amount_ex_gst` → use ex-GST with GST component in separate column. Risk: LOW

### Outstanding items + invoices
- **AC-013 [MUST]** `outstanding-items.csv` per entity includes: uncategorised txns, txns with no confirmed ATO code, subcategories used in FY without a default mapping, months without statement imports, missing required assumptions, Drive invoice files not linked to any txn, txns still in transfer review. Each row has type + description + resolution link. Risk: MED
- **AC-014 [MUST]** Settings → Entity edit form has optional "Invoice Drive folder path" field with default placeholder `/Family Hub/Invoices/{entity-name}/FY{yy-yy}/`. Risk: LOW
- **AC-015 [MUST]** Given an entity with configured Drive folder, when export runs, then every file (PDF/JPG/PNG/WEBP/HEIC/DOCX) in the folder is copied into the entity's `invoices/` subfolder in the ZIP. Max 500 files, shallow scan. Risk: MED
- **AC-016 [MUST]** `invoices-index.csv` has columns: `filename, date, supplier, amount, ato_code, linked_txn_id, match_status, notes`. Rows pre-populated from filename parsing; unmatched rows marked `match_status=unmatched`. Risk: LOW
- **AC-017 [SHOULD]** Tax Prep → Invoices tab has a drawer UI for tagging invoice files (supplier, amount, linked txn) — can ship in v0.1.3 if tight. Risk: MED

### Access + quality
- **AC-018 [MUST]** Non-admin on any `/api/financials/tax/*` route → 403. Risk: LOW
- **AC-019 [MUST]** Empty FY → entity still gets a subfolder with a valid PDF (marked "No data") + empty CSVs with headers intact. Risk: LOW
- **AC-020 [MUST]** Current FY (end in future) → cover sheet and reports show "Year-to-date as at {today}" instead of "Full year". Risk: LOW
- **AC-021 [SHOULD]** Re-export same FY → filename includes timestamp suffix so previous runs aren't overwritten. Risk: LOW
- **AC-022 [SHOULD]** Large FY (10k+ txns) → generation completes within 60s via SSE streaming, no timeout. Risk: MED
- **AC-023 [MUST]** `src/components/financials/tax-tab.tsx` migrates from local `StatCard` to `@/components/ui/stat-card`. Risk: LOW

### AI cost transparency
- **AC-024 [MUST]** Settings panel has "Use Claude AI for ambiguous ATO code proposals" toggle, default OFF. Toggling writes to `app_settings.ai_claude_enabled_ato`. When OFF, ingest uses rule-based only. When ON, ingest uses rule-based + Claude fallback for ambiguous rows. Risk: LOW
- **AC-025 [MUST]** Settings panel shows three live-calculated cost numbers: per-import (100 txns), monthly (90-day rolling average), one-time backfill (only when toggle is OFF). Cites model (Claude Haiku 4.5) and pricing. Recomputed on every page load. Confirmation dialog before toggling re-shows the numbers. Risk: MED
- **AC-026 [MUST]** When Claude toggle is OFF, ingest never calls Claude API. Rule-based only. Categorise page and export work identically regardless of toggle state. Risk: LOW

## Out of scope

- Mobile export flow (desktop only for tax prep)
- Concurrent admin exports (last write wins on temp files)
- Offline support
- Rolling 12-month non-FY reports
- Invoice Scanner full integration → F2 (v0.2.0+)
- Balance sheet / account balances at FY end
- Per-transaction ATO override UI at transaction detail page
- Loan principal/interest split
- DGR verification for donations (manual flagging only)

## Assumptions

- ASSUMPTION-001 — Accountant receives ZIP via email/Drive share; no in-app "share with accountant" feature
- ASSUMPTION-002 — PDF cover sheet uses existing visual style (Geist font, blue accents), no brand logo
- ASSUMPTION-003 — FY always 1 Jul – 30 Jun Australian (validated from user profile)
- ASSUMPTION-004 — Transfer-detected transactions auto-excluded from tax reports
- ASSUMPTION-005 — "Income" for Personal = existing INCOME category; no separate PAYG import for F1
- ASSUMPTION-006 — Invoices in Drive follow per-entity folder structure, configurable in Settings
- ASSUMPTION-007 — AI-proposed ATO accuracy target ~70% for one-click accept

## Schema changes

Drizzle migration: `drizzle/0002_phase_f_tax_prep.sql`

```typescript
// financial_subcategories — extend
atoCodePersonal: text('ato_code_personal'),
atoCodeCompany:  text('ato_code_company'),

// financial_transactions — extend + 2 indexes
atoCodePersonal:           text('ato_code_personal'),
aiSuggestedAtoCodePersonal:text('ai_suggested_ato_code_personal'),
atoCodeCompany:            text('ato_code_company'),
aiSuggestedAtoCodeCompany: text('ai_suggested_ato_code_company'),
// + index('idx_fin_txn_ato_personal').on(atoCodePersonal)
// + index('idx_fin_txn_ato_company').on(atoCodeCompany)

// financial_entities — extend
invoiceDriveFolder: text('invoice_drive_folder'),

// ato_codes — new
pgTable('ato_codes', {
  code: text('code').primaryKey(),
  scope: text('scope').notNull(),                    // 'personal' | 'company'
  section: text('section').notNull(),                // 'income' | 'deduction' | 'expense' | 'other'
  label: text('label').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  isInternalSubcode: boolean('is_internal_subcode').default(false),
  rollsUpTo: text('rolls_up_to'),
  createdAt: timestamp('created_at').defaultNow(),
})

// app_settings — new (key-value store for shared admin config)
pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value'),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
})

// invoice_tags — new
pgTable('invoice_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  gdriveFileId: text('gdrive_file_id').notNull().unique(),
  entityId: uuid('entity_id').references(() => financialEntities.id, { onDelete: 'set null' }),
  fy: text('fy').notNull(),
  filename: text('filename').notNull(),
  supplier: text('supplier'),
  amount: numeric('amount', { precision: 12, scale: 2 }),
  atoCodePersonal: text('ato_code_personal'),
  atoCodeCompany: text('ato_code_company'),
  linkedTxnId: uuid('linked_txn_id').references(() => financialTransactions.id, { onDelete: 'set null' }),
  matchStatus: text('match_status').default('unmatched'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})
// + index on (entityId, fy), index on linkedTxnId

// export_jobs — new
pgTable('export_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  fy: text('fy').notNull(),
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending'),  // pending | running | complete | error | cancelled
  progressPercent: integer('progress_percent').default(0),
  currentStep: text('current_step'),
  blobUrl: text('blob_url'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  expiresAt: timestamp('expires_at').notNull(),
})
// + index on status, index on expiresAt
```

## API sketches

All routes admin-gated. Auth pattern per CLAUDE.md.

| Route | Method | Purpose | ACs |
|---|---|---|---|
| `/api/financials/tax/export/start` | POST | Create export_jobs row, spawn async task, return `{jobId}` | AC-009, AC-018 |
| `/api/financials/tax/export/[id]/stream` | GET | SSE: progress events → `complete` with blob URL | AC-009, AC-022 |
| `/api/financials/tax/export/[id]/cancel` | POST | Mark job cancelled | AC-009 |
| `/api/financials/tax/export/history` | GET | Last 20 jobs | AC-021 |
| `/api/settings/ai-cost-estimate` | GET | Live cost numbers (per-import, monthly, backfill) | AC-025 |
| `/api/settings/ai-claude-toggle` | POST | Flip `ai_claude_enabled_ato`, requires `confirmed:true` | AC-024 |
| `/api/financials/tax/invoices?entityId&fy` | GET | Drive scan + join with invoice_tags | AC-015, AC-016 |
| `/api/financials/tax/invoices/[gdriveFileId]` | PUT | Upsert invoice tag | AC-016, AC-017 |
| `/api/financials/categorize/...` (extend existing) | PATCH | Add `atoCodePersonal`, `atoCodeCompany`, `acceptAiSuggestions` fields | AC-006, AC-007 |

SSE event format:
```json
{ "type": "progress", "step": "Rendering D3 report (2/4)", "percent": 45 }
{ "type": "complete", "blobUrl": "https://...", "expiresAt": "..." }
{ "type": "error", "message": "..." }
```

## Algorithms

### Rule-based ATO lookup
```
proposeAtoCodes(txn, subcat, entityType):
  aiPersonal = subcat?.atoCodePersonal
  aiCompany  = subcat?.atoCodeCompany

  if entityType == 'personal':    aiCompany = null
  elif entityType in ('business','trust'): aiPersonal = null
  // else: fallback, populate both

  aiPersonal = applyPersonalRefinements(aiPersonal, txn, subcat)
  aiCompany  = applyCompanyRefinements(aiCompany, txn, subcat)
  return { aiPersonal, aiCompany }
```

### Refinement rules (data-driven table)
| Rule | Scope | Condition | Set to |
|---|---|---|---|
| streaming-never | personal | subcategory = Streaming | null |
| saas-entertainment | personal | subcategory = Software & SaaS AND merchant matches `netflix\|spotify\|disney\|stan\|kayo\|prime` | null |
| clothing-needs-uniform | personal | subcategory = Clothing & Apparel AND description doesn't match `uniform\|ppe\|safety\|work wear` | null |
| courses-under-50 | personal | subcategory = Courses & Books AND amount < $50 | null |
| equipment-over-300 | company | subcategory = Equipment & Technology AND amount > $300 | `6-DEPN` |

### Cost estimate formula
```
COST_PER_TXN_USD = (400 / 1_000_000) * 1.00 + (50 / 1_000_000) * 5.00 = $0.00065

perImportCost  = 100 * 0.00065                        = $0.065
monthlyCost    = monthlyAvgTxnCount * 0.00065
backfillCost   = backfillTxnCount * 0.00065
```

### Claude hybrid path
- Only called if `app_settings.ai_claude_enabled_ato === true` AND rule-based returned null for one or both columns
- Model: `claude-haiku-4-5-20251001`
- Any failure → silent fallback to rule-based, logged to `parse_errors`, never blocks ingest

### Drive folder scan
- Resolve folder path → folderId
- `files.list({ q: "'{folderId}' in parents and trashed=false", pageSize: 500 })`
- Filter by MIME: `application/pdf`, `image/jpeg/png/webp/heic`, Word docs
- Fail gracefully if folder not found (log to outstanding items, don't abort export)

## Dependencies to install

```bash
npm install @react-pdf/renderer papaparse @types/papaparse jszip @vercel/blob
```

New env var: `BLOB_READ_WRITE_TOKEN` (Vercel dashboard or `vercel env`)

## Implementation tasks

### Wave 0 — Foundation (sequential)

- [ ] **T-00** [S] Install deps · owns `package.json`, `package-lock.json` · test: `tsc --noEmit` + `npm run build` pass
- [ ] **T-01** [M] Drizzle migration with all 7 schema changes · owns `src/lib/db/schema.ts` + auto-generated `drizzle/0002_phase_f_tax_prep.sql` · run `npx drizzle-kit push` · satisfies AC-001, AC-002, AC-014
- [ ] **T-02** [M] ATO constants + seed script · owns `src/lib/financials/ato-codes.ts`, `src/scripts/seed-ato-codes.ts` · data from `docs/reference/phase-f-ato-codes.xlsx` sheets 2/4, mapping from sheets 3/5 · satisfies AC-003, TD-1, TD-7
- [ ] **T-03** [S] TypeScript types · owns `src/types/financials.ts` · add `AtoScope`, `AtoCode`, `InvoiceFile`, `InvoiceTag`, `ExportJob`, `ExportProgressEvent`, `AiCostEstimate`

### Wave 1 — Logic libs (parallel)

- [ ] **T-10** [M] Rule-based proposer · owns `src/lib/financials/ato-proposer.ts` + `.test.ts` · tests: TC-001 · satisfies AC-004 (partial), TD-7
- [ ] **T-11** [S] Cost calculator · owns `src/lib/financials/ai-cost.ts` + `.test.ts` · tests: TC-002 · satisfies AC-025 (partial)
- [ ] **T-12** [S] App settings helper · owns `src/lib/app-settings.ts` + `.test.ts` · tests: TC-003 · satisfies AC-024 (partial)
- [ ] **T-13** [M] Drive scan helper · owns `src/lib/gdrive/scan-invoices.ts` · tests: TC-014 (manual) · satisfies AC-015, TD-8
- [ ] **T-14a** [M] PDF shared components + cover sheet · owns `src/lib/financials/tax-pdf/shared.tsx`, `cover-sheet.tsx`, `styles.ts` · tests: TC-010 (manual render script) · satisfies AC-010, AC-019, AC-020
- [ ] **T-14b** [M] Entity report PDF template · owns `src/lib/financials/tax-pdf/entity-report.tsx` · tests: TC-011 (manual) · satisfies AC-010, AC-011, AC-012
- [ ] **T-15** [M] Export ZIP bundler · owns `src/lib/financials/tax-export/bundler.ts` · tests: TC-012 (manual integration script) · satisfies AC-009, AC-010, AC-016, TD-3, TD-6

### Wave 2 — API routes (parallel, depend on Wave 1)

- [ ] **T-20** [S] Ingest pipeline mod — call proposer · owns `src/app/api/financials/ingest/route.ts` · satisfies AC-004, AC-026
- [ ] **T-21** [S] Backfill script · owns `src/scripts/backfill-ato-proposals.ts` · satisfies AC-005
- [ ] **T-22** [M] Export start route · owns `src/app/api/financials/tax/export/start/route.ts` · satisfies AC-009, AC-018
- [ ] **T-23** [M] Export SSE stream route · owns `src/app/api/financials/tax/export/[id]/stream/route.ts` · satisfies AC-009, AC-022
- [ ] **T-24** [S] Export cancel + history routes · owns `src/app/api/financials/tax/export/[id]/cancel/route.ts`, `history/route.ts` · satisfies AC-021
- [ ] **T-25** [S] AI cost estimate route · owns `src/app/api/settings/ai-cost-estimate/route.ts` · satisfies AC-025
- [ ] **T-26** [S] AI Claude toggle route · owns `src/app/api/settings/ai-claude-toggle/route.ts` · satisfies AC-024
- [ ] **T-27** [M] Invoices list + tag routes · owns `src/app/api/financials/tax/invoices/route.ts`, `[gdriveFileId]/route.ts` · satisfies AC-016, AC-017 (partial)
- [ ] **T-28** [S] Categorise merchant ATO extension · owns existing categorise PATCH route · satisfies AC-006, AC-007

### Wave 3 — UI (mixed)

- [ ] **T-30** [M] Tax Prep page shell + tabs · owns `src/app/(dashboard)/financials/tax/page.tsx`, `src/components/financials/tax/fy-selector.tsx` · satisfies AC-008, AC-018, AC-023
- [ ] **T-31** [M] Overview tab · owns `src/components/financials/tax/overview-tab.tsx`, `entity-summary-card.tsx` · depends on T-30 · satisfies AC-008, AC-011, AC-013, AC-019
- [ ] **T-32** [M] Invoices tab + drawer · owns `src/components/financials/tax/invoices-tab.tsx`, `invoice-drawer.tsx`, `invoice-tag-form.tsx`, `transaction-picker.tsx` · depends on T-30 · satisfies AC-014, AC-015, AC-016, AC-017
- [ ] **T-33** [M] Export tab + SSE progress · owns `src/components/financials/tax/export-tab.tsx`, `export-progress.tsx`, `export-history.tsx` · depends on T-30 · satisfies AC-009, AC-021, AC-022
- [ ] **T-34** [M] Categorise ATO panel extension · owns `src/components/financials/categorize-view.tsx` (modify), new `src/components/financials/ato-code-panel.tsx`, `ato-code-picker.tsx` · satisfies AC-006, AC-007
- [ ] **T-35** [M] Settings AI cost panel · owns `src/components/settings/ai-cost-panel.tsx`, `confirm-toggle-dialog.tsx`, `src/app/(dashboard)/settings/page.tsx` (modify) · satisfies AC-024, AC-025, AC-026
- [ ] **T-36** [S] Entity form Drive folder field · owns existing entity form · satisfies AC-014

### Wave 4 — Integration + docs

- [ ] **T-40** [S] Home page Tax card stats — add "Unreviewed" count · owns `src/app/(dashboard)/page.tsx` modification
- [ ] **T-41** [S] Update CHANGELOG · owns `docs/CHANGELOG.md` · add v0.1.2 entry
- [ ] **T-42** [S] Update test execution log · owns `docs/tests/execution-log.md` · add Phase F section

## Test cases (inline)

Testing: Node built-in test runner (`node --test`), zero new deps. Build + tsc --noEmit are implicit gates — not test cases.

### AUTO tests
- **TC-001 [AUTO]** — covers AC-004 — `src/lib/financials/ato-proposer.test.ts` — all entity type paths, each refinement rule, null fallbacks
- **TC-002 [AUTO]** — covers AC-025 — `src/lib/financials/ai-cost.test.ts` — 100 txns ≈ $0.065, 10k txns ≈ $6.50, rounding
- **TC-003 [AUTO]** — covers AC-024 — `src/lib/app-settings.test.ts` — round-trip write/read/update

### MANUAL tests (via scripts + browser)
- **TC-010 [MANUAL]** — covers AC-010, AC-019, AC-020 — render test PDF cover sheet with fixture data, verify visual
- **TC-011 [MANUAL]** — covers AC-011, AC-012 — render entity report for personal and business fixtures
- **TC-012 [MANUAL]** — covers AC-009, AC-010, AC-016 — run bundler script against dev DB, inspect ZIP structure
- **TC-013 [MANUAL]** — covers AC-006, AC-007 — Categorise page: expand merchant, verify ATO panel shows, accept/override saves
- **TC-014 [MANUAL]** — covers AC-015 — Drive scan: point to test folder with mixed file types, verify correct filtering + 500-file cap
- **TC-015 [MANUAL]** — covers AC-017, AC-014 — Invoices tab drawer: open file, tag it, save, reopen, verify persistence
- **TC-016 [MANUAL]** — covers AC-009, AC-022 — Full end-to-end export via browser: click generate, watch SSE progress, download ZIP, inspect contents
- **TC-017 [MANUAL]** — covers AC-013 — Outstanding items: create known gaps (uncategorised txn, missing assumption, missing statement month), verify all surface in `outstanding-items.csv` and the overview tab
- **TC-018 [MANUAL]** — covers AC-018 — Non-admin user → tax routes return 403
- **TC-019 [MANUAL]** — covers AC-021 — Re-export same FY twice, verify filenames differ by timestamp
- **TC-020 [MANUAL]** — covers AC-024, AC-025, AC-026 — Settings: view cost panel, verify three numbers live-calculated, toggle on/off via confirmation dialog, verify ingest behavior changes
- **TC-021 [MANUAL]** — covers AC-023 — Tax page renders with shared StatCard (not local duplicate)

### AC coverage check
All 26 ACs have at least one TC. ✅

## Cross-domain impact

- **Financials/Ingest** — call `proposeAtoCodes()` on every new transaction
- **Financials/Categorize** — extend PATCH endpoint with ATO fields (backward-compatible)
- **Financials/Transactions API** — read endpoints return new columns
- **Home page Tax card** — new "Unreviewed" stat
- **Settings/Entities** — new `invoice_drive_folder` field
- **Settings root** — new `<AiCostPanel>` component
- **Tasks / Scan / other domains** — no impact

## Release notes (filled at release gate)

### User-facing
_(filled at release)_

### QA
_(filled at release — will list TC-001 through TC-021, regression areas: Categorise daily flow, Import pipeline, Home page stats)_

### Technical
_(filled at release — schema changes listed above, new deps, new env var `BLOB_READ_WRITE_TOKEN`, new DB migration `0002_phase_f_tax_prep.sql`)_
