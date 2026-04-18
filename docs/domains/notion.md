# Notion

Notion workspace hygiene — starts with dedupe of duplicate pages. Scan runs offline (CLI) due to Vercel timeout; review + archive in-app.

**Path ownership:** `src/app/(dashboard)/notion/*`, `src/app/api/notion/*`, `src/components/notion/*`, `scripts/notion-dedupe.ts`

## Shipped

- **v0.1.4 — Notion dedupe** — CLI scanner (`npm run dedupe:scan`), upload reports API, cluster-review UI, archive with 429 retry + concurrency, reason legend, per-cluster plain-English explanation, summary panel, bulk archive, block-count recursive empty heuristic, media-aware keep heuristic, home stats card
- Pages: `/notion` (shell + nav), `/notion/dedupe` (landing + upload), `/notion/dedupe/[id]` (cluster review)
- APIs: `POST /api/notion/dedupe/upload`, `GET /api/notion/dedupe/reports`, `GET /api/notion/dedupe/[id]`, `POST /api/notion/dedupe/[id]/archive`
- Components: `dedupe-cluster-card`, `dedupe-instructions`, `dedupe-legend`, `dedupe-preview-dialog`, `dedupe-reports-list`, `dedupe-review`, `dedupe-summary`, `dedupe-upload-button`

## In-flight

- None.

## Queued (next)

1. **Notion Hygiene v2.0** (memory: `notion_hygiene_v2.md`) — add orphan / stale / broken-link / empty / untitled / oversized / permission / schema / tag checks. Dedupe stays in current tool; these are new scanners.
2. **In-browser dedupe scan** (stretch) — current scan is CLI-only because of Vercel timeout. Workflow DevKit (vercel:workflow) could make this work with resumable steps.

## Deferred

- Notion Hygiene v2.0 was explicitly deferred in its memory file.

## Gaps / rough edges

- No automated test framework in Notion code paths (plan.md documents this). Verification is `tsc --noEmit` + manual review only.
- Dedupe reports grow unbounded — no cleanup/archive of old reports.
- Upload progress is rich but cancellation is not supported mid-upload.

## Related memory

- `notion_hygiene_v2.md`
