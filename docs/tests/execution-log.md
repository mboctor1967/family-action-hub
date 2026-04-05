# Test Execution Log

Running log of all test runs and their results. Newest at top.

Format:
```
## YYYY-MM-DD HH:MM — [type] — feature/area
- TC-nnn: PASS/FAIL — notes
- Build: PASS/FAIL
- Visual: PASS/FAIL (Phase 2 only)
```

Types: `manual`, `build`, `schema`, `visual`, `smoke`

---

## 2026-04-05 — visual + build — UI Refresh v0.1.1 (nav removal + compact NavCards)
- TC-001 (header has no nav links): PASS
- TC-002 (no bottom nav on mobile): PASS
- TC-003 (all 15 cards fit one screen, desktop): PASS
- TC-004 (NavCard compact classes): PASS
- TC-005 (no `description` prop references, tsc clean): PASS
- TC-006 (`<main>` uses `pb-4`): PASS
- TC-007 (back arrow from sub-pages returns to `/`): PASS
- Build (`npm run build`): PASS
- Type-check (`tsc --noEmit`): PASS
- Lint (changed files only): PASS (1 pre-existing `as any` on page.tsx:44, out of scope)
- code-reviewer: PASS (0 blocking)


## 2026-04-05 — build — Phase D: Assumptions CRUD
- Build: PASS (17.5s, all 4 assumptions routes registered)
- Schema: PASS (drizzle-kit push — unique index applied to Neon)
- Routes: /api/financials/assumptions, /api/financials/assumptions/[id], /api/financials/assumptions/copy, /financials/assumptions
- Spec review: PASS (all 10 requirements verified by automated reviewer)
- Notes: 7 commits total. Home page card enabled (removed "Coming soon" badge).

## 2026-04-05 — build — Phase 2d+2e completion (Accounts, Tax, Scan, Settings)
- Build: PASS
- Pages refactored: /financials/accounts, /financials/tax, /scan, /settings
- Applied: PageHeader component to all 4 pages. Removed manual ArrowLeft headers.
- Notes: Phase 2 now fully complete — all pages use shared components.

## 2026-04-05 — build — Phase 2b completion (Tasks pages refactor)
- Build: PASS (16.2s)
- Pages refactored: /tasks, /tasks/[id], /tasks/new
- Applied: PageHeader, EmptyState, destructive button style (outlined red)
- Notes: Task detail backTo="/tasks" for closer context than home

## 2026-04-05 — build — Phase 2a completion
- Build: PASS (npx next build, 15.7s)
- Visual: PASS (home page renders with new NavCards, stats load correctly)
- Notes: All 12 card stats showing real data. AI-suggested stat shows 0 until Phase 2d wires up persistence.

## 2026-04-05 — schema — `ai_suggested_category` column added
- Migration: PASS (drizzle-kit push)
- Column exists on `financial_transactions`
- Backfill needed: No (nullable, populated going forward)

## 2026-04-05 — build — Phase 1 completion
- Build: PASS
- Visual: N/A (no page changes)
- Notes: 5 shared UI components added: PageHeader, StatCard, NavCard, EmptyState, DataTableContainer. Old components still in use on existing pages.

## 2026-04-05 — manual — Transfer detection (Phase C)
- Smoke test: PASS — detects pairs, confidence scoring works, confirm flow updates DB correctly
- Verified: Confirmed transfers excluded from spending tab and summary
- Build: PASS

## 2026-04-04 — schema — Phase B schema extensions
- Migration: PASS
- Columns added: `ato_code`, `amount_ex_gst`, `gst_amount`, `gst_applicable`, `transfer_pair_id`
- Tables added: `transaction_splits`, `financial_assumptions`
- Verified via `information_schema` query

---

## Template for future entries

```
## YYYY-MM-DD HH:MM — [type] — description
- TC-nnn: PASS/FAIL — notes
- Build: PASS/FAIL
- Notes: ...
```
