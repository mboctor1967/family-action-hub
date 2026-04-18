# Home / Shell

The top-level landing page, layout shell, shared UI primitives, and cross-cutting infrastructure. Not a domain in the feature sense — more the scaffolding that every domain sits on.

**Path ownership:** `src/app/(dashboard)/page.tsx`, `src/app/(dashboard)/layout.tsx`, `src/components/ui/*`, `src/components/layout/*`, `src/lib/db/schema.ts` (shared), `src/lib/auth.ts`

## Shipped

- **v0.1.1 — UI refresh** (memory: `ui_refresh_next.md`) — nav bars removed, NavCards compacted, 13-card home grid, 5-stage Financials workflow grouping
- **UI standardization** (memory: `ui_standardization_decisions.md`) — card radius `rounded-2xl`, inline box `rounded-lg`, button `rounded-md`, page spacing `space-y-6`, card padding `p-5`, compact NavCard `p-3`
- **Home card stats** (memory: `home_card_stats.md`) — 13 cards with agreed server-computed stats
- Auth: Google OAuth via NextAuth, `/api/*` returns JSON 401 (not HTML login redirect) — `e48946b`
- Shared components: 21 primitives in `src/components/ui/` — avatar, badge, button, card, checkbox, data-table-container, dialog, dropdown-menu, empty-state, input, nav-card, page-header, scroll-area, select, separator, sheet, stat-card, table, tabs, textarea, tooltip

## In-flight

- None.

## Queued (next)

1. **Modular monolith enforcement** (memory: `modular_monolith_refactor.md`) — ESLint rule + `dep-cruiser` config to enforce domain boundaries (no cross-domain imports except through a shared `lib/` layer). ~1.5 wks. Queued 2026-04-16. **This is the technical backing for the single-domain-branch rule.**
2. **Remove or build "Coming soon" NavCards** — `/vehicles` (page.tsx:428–434) and `/financials/duplicates` are listed on the home grid but routes don't exist. Either ship or delete.
3. **Portal landing revisit** (memory: `portal_landing_revisit.md`) — holistic redesign of the home page / main menu. Deferred until all in-flight work ships.

## Deferred

- **Portal landing revisit** — explicitly deferred in its memory file.
- **New dashboard domains** (e.g. `/vehicles`) — listed on home but unbuilt. Not queued until the owning feature brief exists.

## Gaps / rough edges

- Home page is a single long server component with inline stats queries. Growing toward needing extraction once modular-monolith rules land.
- Shared UI primitives have no visual regression tests.
- `.gitignore` excludes `docs/superpowers/` (local-only planning artifacts) — intentional but worth re-evaluating if specs/plans become collaborative.

## Related memory

- `portal_landing_revisit.md`, `ui_refresh_next.md`, `ui_standardization_decisions.md`, `home_card_stats.md`, `modular_monolith_refactor.md`, `integrated_implementation_plan.md`, `sdlc_structure.md`, `deployment_info.md`
