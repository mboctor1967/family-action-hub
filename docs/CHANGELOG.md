# Changelog

All notable changes to the Boctor Family Hub app.

Format: `YYYY-MM-DD — [type] — summary (refs)`
Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `schema`

## Unreleased

- **2026-04-20** — `feat` — **v0.3.3 — Scan ↔ Tasks nav quick-links.** Added `action`-slot links on `/scan` ("Tasks →") and `/tasks` ("← Scan") page headers so the triage-to-task workflow can be navigated without going through the home page. UX polish only — no schema or API changes. Standalone branch `feat/ux/scan-tasks-crosslink`, shipped ahead of the Gmail daily digest feature.

- **2026-04-19** — `feat` — **v0.3.2 — WhatsApp home stat card.** New informational NavCard on the home page's "Tasks & Inbox" row showing messages processed, last activity, and allowlist size. Pure display (`informational` prop on `NavCard`) — no click-through since WhatsApp IS the primary UI for that domain. Admin-only.

- **2026-04-19** — `fix` — **v0.3.1 — WhatsApp bot polish.** (1) Timezone-aware `spend` — month boundaries now respect `Australia/Sydney` instead of Vercel's UTC, fixing a bug where end-of-month queries could be off by up to 14 hours. New shared `src/lib/constants.ts` exports `APP_TIMEZONE`, `APP_LOCALE`, `fyStartYearFor()`, and `nowInAppTz()` for reuse across domains. (2) Diagnostic `console.log` statements stripped from webhook route (were added for live smoke-test debugging; no longer needed). (3) Updated docs/domains/whatsapp.md + `whatsapp_bot_resume.md` memory file to reflect SHIPPED state.

- **2026-04-19** — `feat` — **v0.3.0 — WhatsApp group bot (v1).** New domain. Family WhatsApp group bot with 3 read-only financials commands: `spend` (this month's total + top 3 categories), `balance` (latest per account), `recent` (last 5 transactions). Allowlist-gated by E.164 phone number via `WHATSAPP_ALLOWED_NUMBERS` env var. New endpoint `GET/POST /api/whatsapp/webhook`. HMAC-SHA256 signature verification on inbound. Idempotency via new `whatsapp_processed_messages` table. Fast-ack architecture (returns 200 before reply). 27/27 vitest tests green. Refs: `docs/features/2026-04-15-whatsapp-group-bot.md`, `docs/superpowers/plans/2026-04-15-whatsapp-group-bot.md` (plan local-only per gitignore).

- **2026-04-19** — `feat` — **v0.2.2 — Legal pages.** Added `/privacy` and `/terms` as public routes (unauthenticated access allowed via middleware allowlist). Content reflects the app's single-household, invite-only nature — Google OAuth + Neon/Vercel/Gmail/Anthropic/Meta WhatsApp as data processors. Required for Meta App Review (WhatsApp Cloud API publish flow).

- **2026-04-18** — `feat` — **v0.2.1 — Triage simplification.** Gmail scan triage flow collapsed from per-row Confirm/Reject + inline edit form to a single checkbox per row + one-click commit. Ticked rows become tasks with AI-suggested metadata; unticked rows are marked rejected and the classifier learns from the decision. Zero-tick commit opens a confirmation dialog. On success, redirects to `/tasks?new=<ids>` which auto-scrolls to the first new task and applies a 2-second amber ring. Added `POST /api/scan/triage/batch` (sequential — neon-http driver does not support transactions; AC6 atomic rollback is best-effort). Extracted `confirmEmailAsTask` + `rejectEmail` helpers into `src/lib/scan/triage-actions.ts`; single-row route delegates to them. vitest added for unit tests (6 passing). Refs: `docs/superpowers/specs/2026-04-18-triage-simplification-design.md`, `docs/superpowers/plans/2026-04-18-triage-simplification.md` (both local-only per gitignore).

- **2026-04-18** — `chore` — **v0.2.0 — Recovery merge.** Ships work that had been stranded on `feat/financials-fingerprint-dedupe` for weeks and never merged, plus the per-domain backlog structure.
  - Financials: **transaction fingerprinting** (content-hash dedup per account), **QIF import** alongside existing CSV/QFX, **bank codes** lookup. (`4154db6`)
  - Financials: **spending trend chart** with sort. (`f4d939d`)
  - Financials: **coverage tab rebuilt** — FY grouping, per-account rows, statement-detail expand, account gap surface. (`ad784c9`)
  - Financials: **account filter + categorize/import polish**. (`f46d687`)
  - Tasks: narrow `task.gmailLink` through closure for Next 16 strict typing. (`fb42cae`)
  - Scripts: new `ai-categorize-unclassified.ts`, `dedupe-transactions.ts`, `migrate-txn-fingerprint.ts` helpers.
  - Docs: per-domain backlog structure under `docs/domains/` — one file per domain (Financials, Invoices, Tasks, Scan, Notion, Settings, WhatsApp, Home/Shell). Paired with the new `feedback_single_domain_branches.md` rule in memory.

- **2026-04-06** — `feat` — **v0.1.2** Phase F1: Tax Prep / Accountant Pack. New `/financials/tax` tabbed page (Overview / Invoices / Export). One-click "Generate Accountant Pack" produces a ZIP with one subfolder per entity containing PDF report + CSVs (transactions, expenses-by-ATO-code, income, assumptions, outstanding items) + bundled invoices from a per-entity Drive folder. Personal entities use Individual Tax Return codes (D1–D15, I-1–I-24); Pty Ltd entities use Company Tax Return Item 6 codes. SSE-streamed generation with real-time progress. Export bundle uploaded to Vercel Blob (1-hour signed URL). Rule-based AI ATO code proposer runs on every import. Optional Claude AI enhancement for ambiguous cases, user-toggleable in Settings with live cost estimate (per-import / monthly / backfill). Phase F split: F1 = tax prep + Drive folder scan (this release); F2 = full Invoice Scanner integration (deferred to v0.2.0+). Refs: `docs/features/2026-04-06-phase-f-tax-prep.md`.

- **2026-04-06** — `chore` — Workflow simplified: 14 command files collapsed into 2 (`feature.md` + `debug.md`), 9-phase SDLC merged into a single feature-brief pattern in `docs/features/`. CLAUDE.md rewritten with streamlined conventions. Test plan and deployment doc now inline in the feature brief and release gate respectively. Backed up to `docs/archive/workflow-backup-2026-04-06/`.


- **2026-04-05** — `refactor` — **v0.1.1** UI Refresh: removed duplicate header nav links and mobile bottom nav — the home page is now the single navigation hub. Compacted `NavCard` (`p-3`, smaller icon, no description text) so all 15 home cards fit on one screen at desktop resolutions. Dropped `pb-20 md:pb-4` from `<main>` since the fixed bottom nav is gone. Deleted `src/components/layout/bottom-nav.tsx`. No schema, API, or behaviour changes — every sub-page still reaches home via its existing `<PageHeader>` back arrow. Refs: `docs/requirements/2026-04-05-ui-refresh-nav-removal.md`, `docs/specs/2026-04-05-ui-refresh-nav-removal.md`, `docs/plans/2026-04-05-ui-refresh-nav-removal.md`.

- **2026-04-05** — `feat` — Phase D: Assumptions CRUD page at `/financials/assumptions`. FY tabs, entity-grouped tables, create/edit dialog, delete confirmation, copy-from-previous-FY. Unique index on (fy, entityId, assumptionType). Shared helpers in `src/lib/assumptions.ts`.
- **2026-04-05** — `refactor` — Phase 2d+2e: Applied `<PageHeader>` to Accounts, Tax, Scan, and Settings pages. All pages now use shared components consistently.
- **2026-04-05** — `refactor` — Phase 2b: Tasks pages (list, detail, new) refactored with `<PageHeader>` and `<EmptyState>`. Destructive delete button switched to outlined red style.
- **2026-04-05** — `docs` — Set up structured SDLC folder layout: `requirements/`, `specs/`, `plans/`, `tests/`. Moved v3 and v4 requirements to `requirements/`. Added CHANGELOG, test plan, and execution log.
- **2026-04-05** — `refactor` — Phase 2a: Home page refactored with `<NavCard>` and `<PageHeader>`. All 12 card stats implemented server-side. Applied new design rules (`rounded-2xl`, `p-5`, `space-y-6`).
- **2026-04-05** — `schema` — Added `ai_suggested_category` column to `financial_transactions` for Categorise card stat.
- **2026-04-05** — `feat` — Phase 1: Built 5 shared UI components — `PageHeader`, `StatCard`, `NavCard`, `EmptyState`, `DataTableContainer`.
- **2026-04-05** — `feat` — Phase C: Transfer detection with manual trigger button + review queue with confirm/override. Excludes confirmed transfers from spending and tax reports.
- **2026-04-04** — `schema` — Phase B: Added `ato_code`, `amount_ex_gst`, `gst_amount`, `gst_applicable`, `transfer_pair_id` columns; new `transaction_splits` and `financial_assumptions` tables.
- **2026-04-04** — `feat` — Phase A: Card-based home page with workflow grouping (Setup → Ingest → Clean → Analyse → Output).
- **2026-04-04** — `feat` — Categorise Merchants page with AI auto-categorization, bulk operations, search, and filter controls.
- **2026-04-03** — `feat` — Import Statements flow: Drive folder scan, file preview, bulk select, AI parsing, post-import mapping.
- **2026-04-03** — `feat` — Accounts & Entities management with CRUD for both.
- **2026-04-03** — `feat` — Financial dashboard with Overview, Spending, Subscriptions, Coverage, and Tax tabs.
- **2026-04-02** — `feat` — CSV + QFX/OFX import support for bank statements.
- **2026-04-02** — `schema` — Financial module base tables (accounts, entities, statements, transactions).
- **2026-04-01** — `feat` — Task management with Gmail scanning and AI classification.
- **2026-04-01** — `feat` — Initial app scaffold with Next.js 16, Neon Postgres, Google OAuth.
