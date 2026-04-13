---
feature: Notion Dedupe (new Notion domain)
date: 2026-04-13
version: v0.1.4
tier: HIGH
score: 12
status: brief
---

# Notion Dedupe — Feature Brief

## Sizing

| Factor | Points |
|---|---|
| Schema changes (new table) | +2 |
| New API endpoints (4 routes) | +2 |
| Cross-domain impact (introduces new domain) | +2 |
| Files touched >5 | +2 |
| New UI components (domain landing, tabs, review page, cluster card) | +1 |
| New user behaviour (upload + review + archive flow) | +1 |
| ACs expected >4 | +2 |
| **Total** | **12 → HIGH** |

## Goal

Introduce a **Notion** domain in the hub with a tabbed layout, shipping one tab (**Dedupe**) that lets the admin review CLI-generated duplicate reports and archive duplicate pages through the Notion API with a preview-confirm safety step.

Future Notion tabs (Categorise, Search, Invoices) are out of scope for this brief but the domain structure is designed to accept them without refactor.

## User stories

- **As the admin**, I want to upload a JSON dedupe report produced by `npm run dedupe:scan` so I can review findings in a UI instead of reading a 1 MB CSV.
- **As the admin**, I want to review duplicate clusters with KEEP auto-selected and DELETE rows tickable so I can confirm each decision.
- **As the admin**, I want a preview-confirm step before archiving so I can eyeball the full batch before it touches Notion.
- **As the admin**, I want archived/failed state persisted per page so I can resume review across sessions and retry failures.
- **As the admin**, I want past reports listed so I can track dedupe history over time.

## Key decisions (inline ADRs)

### ADR-1: Scanning stays as a local CLI; hub handles review only
Vercel function timeout (~60s hobby / 300s pro) can't cover a multi-minute scan of thousands of Notion pages. Options considered: background jobs in Postgres (A), local CLI + upload (B), chunked scans (C). Chose **B**: reuses the existing working CLI, no job infra, no cursor state, no polling. Cost: admin runs a terminal command before each review session. Acceptable for a quarterly cleanup tool.

### ADR-2: Single jsonb-backed table, not normalized
One `notion_dedupe_reports` row per upload, holding the full cluster report as jsonb + a `decisions` jsonb tracking per-page state. Normalized schema (reports/clusters/pages tables) considered but rejected: no analytical queries justify three tables, reports are write-once review-many, and solo-admin usage never needs cross-report queries. Cost: can't index on cluster fields. Not needed.

### ADR-3: Bulk archive with preview-confirm, KEEP rows non-selectable
Per-row archive rejected as too tedious for hundreds of clusters. Raw bulk archive rejected as unsafe. Preview modal adds one click and lets the admin eyeball the final list before commit. Notion trash is reversible (30-day restore) so this is belt-and-suspenders but cheap. KEEP rows are UI-locked — cannot be selected for archive regardless of state.

### ADR-4: Reuse `NOTION_DEDUPE_TOKEN` for both read and archive
Split read/write tokens considered for safety but rejected: archiving is already reversible (Notion trash), preview-confirm already gates it, and two tokens is ceremony without meaningful protection for a solo admin. Admin verifies integration has "Update content" permission at wire-up.

### ADR-5: Tabbed domain layout, no placeholder tabs
`/notion` renders a tab bar via PageHeader. Only one tab ships (Dedupe). Placeholder tabs for Categorise/Search/Invoices rejected — they rot, mislead users on roadmap, and the tab bar trivially accepts new tabs later. Brief + memory are the authoritative roadmap surface.

### ADR-6: Standalone home-grid NavCard for Notion domain
Notion becomes a first-class domain alongside Tasks/Financials/Scan/Settings, not a settings sub-page or a hidden bookmark. Home grid gains one NavCard: "Notion". Justified because multiple future tools will live here, not just dedupe.

## Acceptance criteria

| ID | Priority | Given / When / Then |
|---|---|---|
| AC-1 | MUST | **Given** admin role, **when** visiting `/notion`, **then** a tabbed page renders with a "Dedupe" tab active. |
| AC-2 | MUST | **Given** a non-admin session, **when** hitting any `/api/notion/dedupe/*` route, **then** response is 403. |
| AC-3 | MUST | **Given** `/notion/dedupe`, **when** viewed, **then** an "How this works" instruction panel shows the 4 numbered steps (scan, upload, review, archive) and is collapsible with state in localStorage. |
| AC-4 | MUST | **Given** `/notion/dedupe`, **when** viewed, **then** a list of past reports renders (most recent first) showing upload date, cluster count, archived count. |
| AC-5 | MUST | **Given** a valid CLI JSON report, **when** uploaded via the upload button, **then** a `notion_dedupe_reports` row is inserted and the UI redirects to `/notion/dedupe/[id]`. |
| AC-6 | MUST | **Given** a malformed or schema-invalid JSON upload, **when** POSTed, **then** response is 400 with a parse/validation error and no row is inserted. |
| AC-7 | MUST | **Given** `/notion/dedupe/[id]`, **when** viewed, **then** clusters render as cards with KEEP auto-selected (longest body, tiebreak most recent edit) and DELETE rows tickable. |
| AC-8 | MUST | **Given** the review page, **when** attempting to select a KEEP row, **then** the action is UI-blocked (checkbox disabled). |
| AC-9 | MUST | **Given** selected DELETE rows, **when** clicking "Preview archive", **then** a modal shows the exact list (N pages across M clusters) with Confirm / Cancel. |
| AC-10 | MUST | **Given** the preview modal, **when** Confirm is clicked, **then** the archive API is called, each page is archived via `PATCH /pages/{id} {archived:true}`, and the `decisions` jsonb is updated per page. |
| AC-11 | MUST | **Given** archive completion, **when** the review page refreshes, **then** archived rows are greyed with a check icon and failed rows show an error with a retry button. |
| AC-12 | MUST | **Given** a Notion 403 response during archive, **when** surfaced, **then** the UI shows a clear error banner explaining the token lacks "Update content" scope. |
| AC-13 | SHOULD | **Given** a Notion 429 response, **when** archiving, **then** the route retries once after backoff before marking the page failed. |
| AC-14 | SHOULD | **Given** a fully-archived cluster, **when** rendered, **then** it collapses by default on the review page. |
| AC-15 | SHOULD | **Given** the review page, **when** filters applied (confidence, status, search), **then** clusters filter accordingly. |
| AC-16 | COULD | **Given** the review page, **when** "Export CSV" is clicked, **then** a CSV of current clusters + decisions downloads. |

## Schema

```ts
// src/lib/db/schema.ts (append)
export const notionDedupeReports = pgTable('notion_dedupe_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
  uploadedBy: text('uploaded_by').notNull(),
  filename: text('filename').notNull(),
  scanTimestamp: text('scan_timestamp').notNull(),
  totalClusters: integer('total_clusters').notNull(),
  totalPages: integer('total_pages').notNull(),
  report: jsonb('report').notNull(),
  decisions: jsonb('decisions').notNull().default('{}'),
})
```

`decisions` shape:
```ts
type Decisions = Record<string, {
  status: 'archived' | 'failed' | 'skipped'
  at: string           // ISO timestamp
  error?: string       // present when status='failed'
}>
```
Pages absent from `decisions` are `pending`.

Migration: `npx drizzle-kit push` with `.env.local` loaded.

## API routes

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/notion/dedupe/reports` | List past reports (id, uploadedAt, totals, archivedCount derived from decisions) | admin |
| POST | `/api/notion/dedupe/upload` | Body: JSON report. Validates shape, inserts row, returns `{ id }` | admin |
| GET | `/api/notion/dedupe/[id]` | Full report + decisions for review page | admin |
| POST | `/api/notion/dedupe/[id]/archive` | Body: `{ pageIds: string[] }` (max 100). Archives via Notion API, merges results into `decisions`. Returns `{ archived: n, failed: [{ pageId, error }] }` | admin |

**Archive route internals:**
- Concurrency 4 (matches CLI)
- Per-page try/catch — batch continues on individual failure
- 429 → exponential backoff + one retry → fail
- Notion is idempotent on `archived:true`, so refresh-during-archive is safe
- Max 100 pages per call enforced server-side

## UI sketch

### Home grid
Add one NavCard: **Notion** → `/notion`.

### `/notion`
```
PageHeader: "Notion" (back to /)
Tabs: [ Dedupe ]   ← only one for now
```

### `/notion/dedupe`
```
┌─ Notion › Dedupe ───────────────────────────────┐
│                                                  │
│  ┌─ How this works ────────────  [Hide ▾] ────┐ │
│  │ 1. Scan — `npm run dedupe:scan` locally    │ │
│  │ 2. Upload the JSON report                  │ │
│  │ 3. Review — tick DELETE rows               │ │
│  │ 4. Archive — preview + confirm             │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  [ Upload report ]                               │
│                                                  │
│  ── Past reports ──                              │
│  2026-04-13  •  342 clusters  •  47 archived     │
│  2026-03-02  •  128 clusters  •  all reviewed    │
└──────────────────────────────────────────────────┘
```

### `/notion/dedupe/[id]`
```
PageHeader: "Dedupe › Report 2026-04-13"
Banner:  ⓘ Tick DELETE rows to archive. KEEP locked.
Filters: [confidence ▾] [status ▾] [search]
Selected: 47 pages across 18 clusters
[ Preview archive ] [ Export CSV ]

┌─ Cluster 1 — "Grocery list" (3 pages, 100%) ─┐
│ identical body                                │
│ ○ KEEP   Grocery list       1204ch  3/11     │
│ ☐ DELETE Grocery list         12ch  3/12     │
│ ☑ DELETE Grocery list (copy)   0ch  3/11     │
└───────────────────────────────────────────────┘
┌─ Cluster 2 — all archived ─ (collapsed)      ┐
└───────────────────────────────────────────────┘
```

Row states: pending (checkbox), selected (checked), archived (grey + check), failed (red + retry), skipped (strikethrough). Title links to Notion page URL in new tab.

## Implementation tasks

Test cases inline per task. Every task references AC(s).

### T1 — Schema + migration
- Add `notionDedupeReports` table to `src/lib/db/schema.ts`
- Run `drizzle-kit push` locally
- **TC-1.1**: row round-trip (insert + select) preserves jsonb shape
- Covers: foundation for AC-5, AC-10

### T2 — Home grid NavCard
- Add **Notion** card to home page grid → links to `/notion`
- **TC-2.1**: card renders, navigates to `/notion`
- Covers: AC-1 (prerequisite)

### T3 — `/notion` domain landing + tab shell
- Create `src/app/(dashboard)/notion/layout.tsx` with tab bar
- Create `src/app/(dashboard)/notion/page.tsx` redirecting to `/notion/dedupe` (only tab)
- **TC-3.1**: unauth → 401; non-admin → 403; admin → renders tabs
- Covers: AC-1

### T4 — Upload API route + validator
- `POST /api/notion/dedupe/upload` with auth guard + zod schema matching CLI output
- **TC-4.1**: valid JSON → 200 + id
- **TC-4.2**: malformed JSON → 400
- **TC-4.3**: missing `clusters` field → 400
- **TC-4.4**: non-admin → 403
- Covers: AC-2, AC-5, AC-6

### T5 — Reports list API + `/notion/dedupe` page
- `GET /api/notion/dedupe/reports` returns sorted list with archivedCount derived
- Landing page renders instruction panel (collapsible, localStorage), upload button, reports list
- **TC-5.1**: list sorts newest-first
- **TC-5.2**: archivedCount matches `decisions` count where status='archived'
- **TC-5.3**: instruction panel collapse state persists across reload
- Covers: AC-3, AC-4

### T6 — Report detail API + review page skeleton
- `GET /api/notion/dedupe/[id]` returns full report + decisions
- Review page renders cluster cards with KEEP/DELETE rows
- KEEP auto-pick logic (longest body, tiebreak most recent edit) — server-side when ingesting upload, stored in jsonb
- KEEP checkbox disabled
- **TC-6.1**: KEEP pick matches longest body
- **TC-6.2**: tie resolved by most recent edit
- **TC-6.3**: KEEP checkbox is disabled in DOM
- Covers: AC-7, AC-8

### T7 — Selection state + preview modal
- Client state tracks selected pageIds
- Preview modal shows count + list
- **TC-7.1**: selecting/unselecting updates counter
- **TC-7.2**: "Select all DELETE in visible clusters" selects only DELETE rows
- **TC-7.3**: preview modal renders exact selected list
- Covers: AC-9

### T8 — Archive API route
- `POST /api/notion/dedupe/[id]/archive` with auth + max-100 validation
- Concurrency 4, per-page try/catch, 429 retry-once with backoff
- Merge results into `decisions`
- **TC-8.1**: successful archive → row updated, returns `{ archived: n }`
- **TC-8.2**: 403 from Notion → surfaced in error
- **TC-8.3**: 429 retries once then fails
- **TC-8.4**: one page fails, rest succeed → batch continues
- **TC-8.5**: >100 pageIds → 400
- Covers: AC-10, AC-12, AC-13

### T9 — Review page post-archive rendering
- After archive, refetch decisions, update row states
- Archived cluster collapse-by-default
- Failed row retry button calls archive API with single pageId
- **TC-9.1**: archived rows render grey + check
- **TC-9.2**: failed rows render red + retry
- **TC-9.3**: fully-archived cluster collapses by default
- **TC-9.4**: retry on failed row resubmits
- Covers: AC-11, AC-14

### T10 — Filters (SHOULD)
- Confidence, status, text search filters
- **TC-10.1**: status filter hides archived clusters when "pending" selected
- Covers: AC-15

### T11 — Export CSV (COULD)
- Export current view (respecting filters) as CSV
- **TC-11.1**: CSV includes current decisions + cluster fields
- Covers: AC-16

### T12 — Docs + release
- Update CHANGELOG with v0.1.4 entry
- Update memory index
- Release gate (lettered menu for version bump + commit)

## Release notes (filled at release)

### For future-you
<!-- TBD at release -->

### For the family
<!-- TBD at release — likely: "New Notion Management section for admin cleanup." -->

### For the git log
<!-- TBD at release -->

## Cross-domain impact

**None.** New domain, new table, new API namespace. Reuses existing auth pattern, existing `NOTION_DEDUPE_TOKEN`, existing UI primitives (PageHeader, NavCard, EmptyState). No changes to Tasks, Financials, Scan, or Settings.
