---
Doc version: v0.2
Last updated: 2026-04-06
Status: IN PROGRESS
App version at last update: v0.1.1
Target release: v0.1.2 (before 30 April 2026)
Changelog:
- v0.1 (2026-04-06) — initial plan with 30 tasks
- v0.2 (2026-04-06) — P1 applied: test cases merged into this doc (no standalone test-plan.md)
---

# Implementation Plan — Phase F1: Tax Prep / Accountant Pack

Requirements: `docs/requirements/2026-04-06-phase-f-tax-prep.md` (v0.2, 26 ACs)
Design: `docs/specs/2026-04-06-phase-f-tax-prep-design.md`
Spec: `docs/specs/2026-04-06-phase-f-tax-prep-spec.md` (8 TDs, 7 schema changes, 9 new APIs, 4 new deps)

## Testing conventions

- **Unit tests** for pure logic libraries: **Node built-in test runner** (`node --test`). Zero new deps. Files suffixed `.test.ts`, run via `npx tsx --test src/lib/**/*.test.ts`.
- **Type check** via `npx tsc --noEmit` — mandatory after every task.
- **Build verification** via `npm run build` — mandatory after every wave.
- **Manual tests** enumerated in the test plan (Phase F.5) and tracked in `docs/tests/execution-log.md`.

## Wave structure

| Wave | Purpose | Tasks | Parallelism | Gate |
|---|---|---|---|---|
| 0 | Dependencies + schema | 4 | Sequential (deps→schema→seed→types) | code-reviewer after |
| 1 | Pure logic libraries | 6 | Fully parallel | code-reviewer after |
| 2 | API routes | 9 | Fully parallel (distinct files) | code-reviewer after |
| 3 | UI components | 7 | Partially parallel (by page) | code-reviewer after |
| 4 | Integration + docs | 3 | Parallel | Final code-reviewer |

---

## Wave 0 — Dependencies + Schema Foundation

Everything downstream depends on this wave. Must complete in order.

### [ ] T-00 — Install new dependencies
- **Size:** S
- **Agent:** implementer
- **[SEQUENTIAL]** — first task
- **Owns:** `package.json`, `package-lock.json`
- **Action:** `npm install @react-pdf/renderer papaparse @types/papaparse jszip @vercel/blob`
- **Test:** `npx tsc --noEmit` passes; `npm run build` succeeds with new deps imported nowhere yet (should still work — packages are latent)
- **Satisfies:** Prereq for TD-2, TD-3, TD-6, DD-4

### [ ] T-01 — Write Drizzle migration for all schema changes
- **Size:** M
- **Agent:** implementer
- **[SEQUENTIAL, DEPENDS ON: T-00]**
- **Owns:** `src/lib/db/schema.ts`, `drizzle/0002_phase_f_tax_prep.sql` (generated)
- **Action:**
  1. Extend `financialSubcategories` with `atoCodePersonal`, `atoCodeCompany`
  2. Extend `financialTransactions` with `atoCodePersonal`, `aiSuggestedAtoCodePersonal`, `atoCodeCompany`, `aiSuggestedAtoCodeCompany` + 2 indexes
  3. Extend `financialEntities` with `invoiceDriveFolder`
  4. Create `atoCodes` table
  5. Create `appSettings` table
  6. Create `invoiceTags` table
  7. Create `exportJobs` table
  8. Add relations as per spec §Schema Changes
  9. Run `npx drizzle-kit push` to generate and apply migration (requires `.env.local` loaded)
- **Test:** `npx tsc --noEmit`; `npm run build`; manual: verify new tables in Neon via `psql` or Drizzle Studio
- **Satisfies:** AC-001, AC-002, AC-014, RG-2, RG-3, RG-4, RG-5

### [ ] T-02 — Write ATO codes constants + seed script
- **Size:** M
- **Agent:** implementer
- **[SEQUENTIAL, DEPENDS ON: T-01]**
- **Owns:** `src/lib/financials/ato-codes.ts`, `src/scripts/seed-ato-codes.ts`
- **Action:**
  1. Create `ato-codes.ts` with `ATO_CODES_PERSONAL` (14 rows) and `ATO_CODES_COMPANY` (29 rows) — data from `docs/reference/phase-f-ato-codes.xlsx` sheets 2 and 4
  2. Create `SUBCATEGORY_ATO_MAP` keyed by subcategory name — data from sheets 3 and 5
  3. Create `REFINEMENT_RULES` typed table per spec §Algorithms
  4. Create seed script that: (a) inserts all rows into `ato_codes` table, (b) populates `financial_subcategories.ato_code_personal` and `ato_code_company` from the mapping
  5. Run seed script once against dev DB
- **Test:**
  - `npx tsx --test src/lib/financials/ato-codes.test.ts` — validates constant shapes, no duplicates, all sub-codes roll up to valid parents
  - Manual: query `SELECT count(*) FROM ato_codes` = 43; query `SELECT count(*) FROM financial_subcategories WHERE ato_code_personal IS NOT NULL` > 0
- **Satisfies:** AC-003, TD-1

### [ ] T-03 — Extend TypeScript types
- **Size:** S
- **Agent:** implementer
- **[SEQUENTIAL, DEPENDS ON: T-01, T-02]**
- **Owns:** `src/types/financials.ts`
- **Action:** Add `AtoScope`, `AtoCode`, `InvoiceFile`, `InvoiceTag`, `ExportJobStatus`, `ExportJob`, `ExportProgressEvent`, `AiCostEstimate` types per spec §Data Models
- **Test:** `npx tsc --noEmit` passes
- **Satisfies:** Prereq for all downstream tasks that import these types

### Wave 0 gate
- [ ] code-reviewer verifies schema matches spec, no drift from Drizzle generated SQL, constants file matches xlsx reference workbook
- [ ] Migration applied to dev DB; counts verified
- [ ] `npm run build` passes

---

## Wave 1 — Pure Logic Libraries (parallel)

Six libraries, all independent, all testable in isolation.

### [ ] T-10 — Rule-based ATO proposer
- **Size:** M
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/lib/financials/ato-proposer.ts`, `src/lib/financials/ato-proposer.test.ts`
- **Action:**
  1. Implement `proposeAtoCodes(txn, subcat, entityType)` per spec §Algorithms
  2. Implement `applyPersonalRefinements()` and `applyCompanyRefinements()` using `REFINEMENT_RULES` from T-02
  3. Write tests covering: each entity type path, each refinement rule (streaming always null, SaaS entertainment regex, clothing uniform keyword, courses < $50, equipment > $300 depreciation), null fallbacks
- **Test:** `npx tsx --test src/lib/financials/ato-proposer.test.ts` — all cases pass
- **Satisfies:** AC-004 (partially — ingest integration in Wave 2), TD-7

### [ ] T-11 — AI cost calculator
- **Size:** S
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/lib/financials/ai-cost.ts`, `src/lib/financials/ai-cost.test.ts`
- **Action:**
  1. Export `COST_PER_TXN_USD` constant
  2. Export `estimateCosts(monthlyTxnVolume, backfillTxnCount)` per spec §Algorithms
  3. Export `CLAUDE_PRICING` constant with model, rates, asOf
  4. Tests verify: 100 txns = ~$0.065, 10,000 txns = ~$6.50, rounding correct
- **Test:** `npx tsx --test src/lib/financials/ai-cost.test.ts`
- **Satisfies:** AC-025 (partially — API wiring in Wave 2)

### [ ] T-12 — App settings helper
- **Size:** S
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/lib/app-settings.ts`, `src/lib/app-settings.test.ts`
- **Action:**
  1. Export `getSetting<T>(key: string): Promise<T | null>`
  2. Export `setSetting<T>(key: string, value: T, updatedBy?: string): Promise<void>`
  3. Export typed convenience: `isClaudeEnabled()`, `setClaudeEnabled(enabled, userId)`
  4. Use Drizzle upsert pattern
- **Test:** Integration test — write a value, read it back, update it, verify
- **Satisfies:** AC-024 (partially — toggle API in Wave 2)

### [ ] T-13 — Drive folder scan helper
- **Size:** M
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/lib/gdrive/scan-invoices.ts`
- **Action:**
  1. Export `scanInvoiceFolder(folderPath, accessToken)` per spec §Algorithms
  2. Export `resolveFolderIdFromPath(path, accessToken)` — walks Drive path segments
  3. Export `ALLOWED_INVOICE_MIME` set
  4. Handle folder not found, empty folder, >500 files (cap + warning)
- **Test:** Manual with a test Drive folder (user to provide in Phase 7 test execution); no unit test for this (Drive API dependency)
- **Satisfies:** AC-015, TD-8

### [ ] T-14 — PDF report templates
- **Size:** L → split
- **Agent:** implementer × 2
- **[PARALLEL]**

#### T-14a — PDF shared components + cover sheet
- **Size:** M
- **Owns:** `src/lib/financials/tax-pdf/shared.tsx`, `src/lib/financials/tax-pdf/cover-sheet.tsx`, `src/lib/financials/tax-pdf/styles.ts`
- **Action:**
  1. Create `styles.ts` with `StyleSheet.create()` palette (blue primary, Geist font registration, page margins)
  2. Create `shared.tsx` with `<ReportHeader>`, `<ReportFooter>`, `<SectionHeading>`, `<SummaryTable>`, `<LineItemTable>`
  3. Create `<CoverSheet>` React-PDF component: title, FY range, entity list, outstanding items summary, generation timestamp
- **Test:** `npx tsx src/scripts/render-test-pdf.ts` — renders a fixture cover sheet to `/tmp/test-cover.pdf`, manual visual check
- **Satisfies:** AC-010, AC-019, AC-020, DD-4

#### T-14b — Entity report template
- **Size:** M
- **Owns:** `src/lib/financials/tax-pdf/entity-report.tsx`
- **Action:**
  1. Props: `{ entity, fy, incomeRows, expenseRowsByAtoCode, assumptions, outstandingItems, gstSummary? }`
  2. Sections: header, income summary, full P&L (with deductibles highlighted), assumptions snapshot, outstanding items
  3. GST summary section renders conditionally (business entities only)
  4. Handles empty FY (AC-019), partial FY (AC-020)
- **Test:** `npx tsx src/scripts/render-test-pdf.ts --entity=personal` and `--entity=company` — fixture data renders both shapes
- **Satisfies:** AC-010, AC-011, AC-012, AC-019, AC-020

### [ ] T-15 — Export ZIP bundler
- **Size:** M
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/lib/financials/tax-export/bundler.ts`
- **Action:**
  1. Export `buildExportZip(jobContext)` — orchestrates the ZIP assembly
  2. For each entity: query txns, render PDF via T-14, generate CSVs via papaparse, fetch invoices via T-13, write to JSZip folder structure
  3. Write cover sheet + README.txt at ZIP root
  4. Return Buffer of the completed ZIP
  5. Upload buffer to Vercel Blob via `@vercel/blob`, return signed URL + expiry
- **Test:** Integration test via `npx tsx src/scripts/test-bundler.ts` — builds a real ZIP against dev DB, inspects folder structure
- **Satisfies:** AC-009, AC-010, AC-016, TD-3, TD-6

### Wave 1 gate
- [ ] All 6 libraries type-check
- [ ] Unit tests pass for T-10, T-11, T-12
- [ ] Manual verification for T-13, T-14a, T-14b, T-15
- [ ] code-reviewer verifies spec compliance
- [ ] `npm run build` passes

---

## Wave 2 — API Routes (parallel)

Nine API routes, all independent (distinct files). Depend on Wave 1 libraries.

### [ ] T-20 — Modify ingest pipeline to call ATO proposer
- **Size:** S
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/app/api/financials/ingest/route.ts` (modify)
- **Action:** In the per-transaction insert loop, call `proposeAtoCodes(...)` and populate `aiSuggestedAtoCodePersonal` and `aiSuggestedAtoCodeCompany`. If `app_settings.ai_claude_enabled_ato === true` and either column is null, call the Claude hybrid path (new private helper in the same file).
- **Test:** Run a test import against dev DB, verify new transactions have suggestions
- **Satisfies:** AC-004

### [ ] T-21 — Backfill script
- **Size:** S
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/scripts/backfill-ato-proposals.ts`
- **Action:** Iterate all transactions with null `ai_suggested_ato_code_personal` AND null `ai_suggested_ato_code_company`; call proposer per row; batch UPDATE in chunks of 500
- **Test:** Run against dev DB; verify row counts before/after
- **Satisfies:** AC-005

### [ ] T-22 — Export start route
- **Size:** M
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/app/api/financials/tax/export/start/route.ts`
- **Action:** Admin auth check. Create `export_jobs` row with status `pending`. Fire-and-forget async: call `buildExportZip` (T-15), update job status as it progresses. Return `{ jobId }`. Opportunistic cleanup of expired jobs at start.
- **Test:** Manual — POST via curl, observe job row creation
- **Satisfies:** AC-009, AC-018

### [ ] T-23 — Export SSE stream route
- **Size:** M
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/app/api/financials/tax/export/[id]/stream/route.ts`
- **Action:** Admin auth + job ownership check. Return `text/event-stream` ReadableStream. Poll `export_jobs` row every 500ms, emit SSE events for status changes, emit `complete` with blob URL or `error`. Close stream on terminal status. Heartbeat every 10s.
- **Test:** Manual — connect with `curl -N`, watch events flow
- **Satisfies:** AC-009, AC-022, DD-3

### [ ] T-24 — Export cancel + history routes
- **Size:** S
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/app/api/financials/tax/export/[id]/cancel/route.ts`, `src/app/api/financials/tax/export/history/route.ts`
- **Action:** Cancel: update job status to `cancelled`. History: `SELECT ... ORDER BY created_at DESC LIMIT 20`. Both admin-gated.
- **Test:** Manual
- **Satisfies:** AC-009, AC-021

### [ ] T-25 — AI cost estimate route
- **Size:** S
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/app/api/settings/ai-cost-estimate/route.ts`
- **Action:** Admin auth. Query 3-month average txn volume + backfill count. Call `estimateCosts()` from T-11. Return per spec API contract.
- **Test:** Manual — GET returns JSON with expected shape
- **Satisfies:** AC-025

### [ ] T-26 — AI Claude toggle route
- **Size:** S
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/app/api/settings/ai-claude-toggle/route.ts`
- **Action:** Admin auth. Require `confirmed: true` in body. Call `setClaudeEnabled()` from T-12.
- **Test:** Manual — POST, verify `app_settings` row
- **Satisfies:** AC-024

### [ ] T-27 — Invoices list + tag routes
- **Size:** M
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/app/api/financials/tax/invoices/route.ts`, `src/app/api/financials/tax/invoices/[gdriveFileId]/route.ts`
- **Action:**
  - `GET /invoices?entityId&fy` — call `scanInvoiceFolder` (T-13), join with `invoice_tags` rows, return unified list
  - `PUT /invoices/{gdriveFileId}` — upsert into `invoice_tags`
- **Test:** Manual — requires a test Drive folder
- **Satisfies:** AC-016, AC-017 (partial — UI in Wave 3)

### [ ] T-28 — Categorise merchant ATO extension
- **Size:** S
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/app/api/financials/categorize/route.ts` (or the existing merchant PATCH route — locate during task)
- **Action:** Extend existing PATCH handler to accept `atoCodePersonal`, `atoCodeCompany`, `acceptAiSuggestions` fields. Single UPDATE `WHERE merchant_name = ?` writes all fields.
- **Test:** Manual — PATCH, verify txns updated
- **Satisfies:** AC-006, AC-007

### Wave 2 gate
- [ ] All 9 endpoints return correct responses for happy + unauthorized paths
- [ ] code-reviewer verifies auth patterns, error handling, spec contract match
- [ ] `npm run build` passes
- [ ] Manual smoke test: run a full export via API (no UI) end-to-end

---

## Wave 3 — UI Components

Seven UI tasks. Partially parallel — tasks sharing a page must be sequential, tasks on different pages are parallel.

### [ ] T-30 — Tax Prep page shell + tab router
- **Size:** M
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/app/(dashboard)/financials/tax/page.tsx` (rewrite), `src/components/financials/tax/fy-selector.tsx`
- **Action:**
  1. Replace existing simple tax page with shell
  2. `<PageHeader>` + `<FYSelector>` + tab router via URL search params (`?fy=&tab=`)
  3. Three tab placeholder routes: Overview, Invoices, Export
  4. Admin-gate the whole page
  5. Migrate StatCard imports from local to `@/components/ui/stat-card`
- **Test:** Visual — navigate to page, tabs switch, URL reflects state
- **Satisfies:** AC-008, AC-018, AC-023, DD-1

### [ ] T-31 — Tax Prep Overview tab
- **Size:** M
- **Agent:** implementer
- **[SEQUENTIAL, DEPENDS ON: T-30]**
- **Owns:** `src/components/financials/tax/overview-tab.tsx`, `src/components/financials/tax/entity-summary-card.tsx`
- **Action:**
  1. Server-component that queries per-entity stats for the selected FY
  2. Renders a card grid with one `<EntitySummaryCard>` per entity
  3. Each card: entity name, total income, total expenses, outstanding items count, link to Categorise for unresolved
  4. Empty state if no transactions for FY
- **Test:** Visual
- **Satisfies:** AC-008, AC-011, AC-013, AC-019

### [ ] T-32 — Tax Prep Invoices tab + drawer
- **Size:** M
- **Agent:** implementer
- **[SEQUENTIAL, DEPENDS ON: T-30]**
- **Owns:** `src/components/financials/tax/invoices-tab.tsx`, `src/components/financials/tax/invoice-drawer.tsx`, `src/components/financials/tax/invoice-tag-form.tsx`, `src/components/financials/tax/transaction-picker.tsx`
- **Action:**
  1. Entity selector dropdown, file list (left column), drawer opens on click (right column)
  2. Drawer shows PDF preview via `<iframe>` or image via `<img>` for JPG/PNG
  3. Tag form with supplier, amount, personal/company ATO code pickers, transaction picker
  4. Save button → PUT /invoices/{gdriveFileId}
  5. Empty state + loading states
- **Test:** Visual + manual Drive folder scan
- **Satisfies:** AC-014, AC-015, AC-016, AC-017, DD-5

### [ ] T-33 — Tax Prep Export tab + SSE progress
- **Size:** M
- **Agent:** implementer
- **[SEQUENTIAL, DEPENDS ON: T-30]**
- **Owns:** `src/components/financials/tax/export-tab.tsx`, `src/components/financials/tax/export-progress.tsx`, `src/components/financials/tax/export-history.tsx`
- **Action:**
  1. Entity checklist (which entities to include)
  2. "Generate Accountant Pack" button
  3. On click: POST /export/start, open EventSource, render progress via `<ExportProgress>`
  4. On complete: show download button linking to blob URL
  5. Export history table below the generate area
  6. Cancel button during generation
- **Test:** Visual + end-to-end flow
- **Satisfies:** AC-009, AC-021, AC-022, DD-3

### [ ] T-34 — Categorise page ATO panel extension
- **Size:** M
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/components/financials/categorize-view.tsx` (modify), new `src/components/financials/ato-code-panel.tsx`, new `src/components/financials/ato-code-picker.tsx`
- **Action:**
  1. In the existing merchant-expanded row, add `<AtoCodePanel>` above the transaction list
  2. Shows AI-suggested personal and company codes with accept/override
  3. "Accept all AI" button extends to include ATO codes
  4. On save, passes extra fields to the PATCH endpoint (T-28)
- **Test:** Visual — expand a merchant row, verify panel shows
- **Satisfies:** AC-006, AC-007, DD-2

### [ ] T-35 — Settings AI cost panel
- **Size:** M
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/components/settings/ai-cost-panel.tsx`, `src/app/(dashboard)/settings/page.tsx` (modify to include panel), `src/components/settings/confirm-toggle-dialog.tsx`
- **Action:**
  1. Fetch cost estimate via GET /api/settings/ai-cost-estimate on mount
  2. Render per spec §UI Decisions
  3. Toggle button opens confirmation dialog showing the three cost numbers again
  4. On confirm, POST /api/settings/ai-claude-toggle
  5. Success toast + panel re-fetches
- **Test:** Visual
- **Satisfies:** AC-024, AC-025, AC-026

### [ ] T-36 — Entity form Drive folder field
- **Size:** S
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/components/financials/accounts-tab.tsx` (or wherever entity form lives — locate during task)
- **Action:** Add optional "Invoice Drive folder path" input to the entity create/edit form. Placeholder: `/Family Hub/Invoices/{entity-name}/FY{yy-yy}/`. Save through existing entity PATCH endpoint.
- **Test:** Visual — create/edit entity, verify field persists
- **Satisfies:** AC-014

### Wave 3 gate
- [ ] All UI pages render without errors
- [ ] End-to-end test: generate an export with a small FY, download succeeds
- [ ] Categorise page ATO panel saves correctly
- [ ] Settings AI toggle round-trip works
- [ ] code-reviewer verifies shared component usage (PageHeader, StatCard, EmptyState, DataTableContainer)
- [ ] `npm run build` passes

---

## Wave 4 — Integration + Docs

### [ ] T-40 — Home page Tax card stats update
- **Size:** S
- **Agent:** implementer
- **[PARALLEL]**
- **Owns:** `src/app/(dashboard)/page.tsx` (modify Tax Prep card stats)
- **Action:** Add new stat: "Unreviewed" count (transactions where `ato_code_personal IS NULL AND ato_code_company IS NULL AND (ai_suggested_ato_code_personal IS NOT NULL OR ai_suggested_ato_code_company IS NOT NULL)`)
- **Test:** Visual — home page shows new stat
- **Satisfies:** Cross-domain integration from spec

### [ ] T-41 — Update CHANGELOG
- **Size:** S
- **Agent:** doc-updater
- **[PARALLEL]**
- **Owns:** `docs/CHANGELOG.md`
- **Action:** Add v0.1.2 entry under Unreleased with feature summary
- **Test:** Markdown rendering
- **Satisfies:** Release prep

### [ ] T-42 — Test execution log seeding
- **Size:** S
- **Agent:** doc-updater
- **[PARALLEL]**
- **Owns:** `docs/tests/execution-log.md`
- **Action:** Seed a Phase F1 section ready for Phase F.7 to fill in with test results
- **Test:** n/a
- **Satisfies:** Test plan prep

### Wave 4 gate — final
- [ ] Full regression: `npm run build`, `npx tsc --noEmit`, all unit tests
- [ ] End-to-end smoke: generate an export for a real FY, inspect ZIP contents
- [ ] code-reviewer final pass across all changes
- [ ] Doc updates verified

---

## AC Coverage Matrix

| AC | Priority | Tasks |
|---|---|---|
| AC-001 Subcategory dual-code columns | MUST | T-01 |
| AC-002 Transaction ATO code columns | MUST | T-01 |
| AC-003 ATO code reference seed | MUST | T-02 |
| AC-004 AI proposes ATO codes on import | MUST | T-10, T-20 |
| AC-005 Backfill existing transactions | MUST | T-21 |
| AC-006 ATO code review on Categorise page | MUST | T-28, T-34 |
| AC-007 One-click accept all | SHOULD | T-28, T-34 |
| AC-008 Tax Prep page lists FYs and entities | MUST | T-30, T-31 |
| AC-009 Generate button produces ZIP download | MUST | T-15, T-22, T-23, T-33 |
| AC-010 Entity subfolder contents | MUST | T-14a, T-14b, T-15 |
| AC-011 Full P&L in reports | MUST | T-14b, T-31 |
| AC-012 GST fallback behaviour | MUST | T-14b |
| AC-013 Outstanding items detection | MUST | T-14b, T-31 |
| AC-014 Drive folder per entity configurable | MUST | T-01, T-36 |
| AC-015 Drive scan and file copy into ZIP | MUST | T-13, T-15 |
| AC-016 invoices-index.csv structure | MUST | T-15, T-27 |
| AC-017 Invoice admin mini-UI | SHOULD | T-27, T-32 |
| AC-018 Admin-only access | MUST | T-22, T-23, T-24, T-25, T-26, T-27, T-30 |
| AC-019 No broken export when FY is empty | MUST | T-14b, T-31 |
| AC-020 Partial FY marker | MUST | T-14b |
| AC-021 Re-export stability | SHOULD | T-24, T-33 |
| AC-022 Large FY handling | SHOULD | T-23, T-33 |
| AC-023 StatCard migration | MUST | T-30 |
| AC-024 Claude AI toggle in Settings | MUST | T-12, T-26, T-35 |
| AC-025 Cost estimate before enabling | MUST | T-11, T-25, T-35 |
| AC-026 Graceful degradation when Claude disabled | MUST | T-20 |

**All 26 ACs covered.** No gaps.

## Task Count Summary

| Wave | Tasks | Parallelism |
|---|---|---|
| Wave 0 | 4 (T-00, T-01, T-02, T-03) | Sequential |
| Wave 1 | 7 (T-10, T-11, T-12, T-13, T-14a, T-14b, T-15) | All parallel |
| Wave 2 | 9 (T-20..T-28) | All parallel |
| Wave 3 | 7 (T-30..T-36; 3 of them depend on T-30) | Mixed |
| Wave 4 | 3 (T-40, T-41, T-42) | All parallel |
| **Total** | **30** | |

## Critical path

```
T-00 → T-01 → T-02 → T-03 → [Wave 1 parallel 7 tasks] → [Wave 2 parallel 9 tasks]
→ T-30 → [T-31 ‖ T-32 ‖ T-33] ‖ [T-34 ‖ T-35 ‖ T-36] → [Wave 4 parallel 3 tasks] → done
```

Estimated walk-clock: Wave 0 ~60 min sequential + Wave 1 ~2 hours parallel + Wave 2 ~2 hours parallel + Wave 3 ~3 hours (gated on T-30) + Wave 4 ~30 min = **~8 hours parallel** if fully staffed with sub-agents.
