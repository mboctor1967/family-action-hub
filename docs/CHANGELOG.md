# Changelog

All notable changes to the Boctor Family Hub app.

Format: `YYYY-MM-DD — [type] — summary (refs)`
Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `schema`

## Unreleased

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
