---
Doc version: v0.1
Last updated: 2026-04-05
Status: SIGNED OFF
App version at last update: v0.1.0
Tier: 2 — Streamlined
---

# Plan — UI Refresh: Nav Removal + Compact NavCards

Requirements: `docs/requirements/2026-04-05-ui-refresh-nav-removal.md`
Spec: `docs/specs/2026-04-05-ui-refresh-nav-removal.md`

## Execution waves

### Wave 1 — Parallel edits (no shared files)

- [ ] **T-1** [PARALLEL] — Compact NavCard component
  - Agent: `implementer`
  - Owns: `src/components/ui/nav-card.tsx`
  - Satisfies: AC-004, AC-005
  - Details: Remove `description` from `NavCardProps`. Change `p-5` → `p-3`, icon box `p-2.5 rounded-lg` → `p-2 rounded-md`, icon `h-5 w-5` → `h-4 w-4`, header `mb-3` → `mb-2`, stats row `mt-3 pt-3 gap-3` → `mt-2 pt-2 gap-2`, stats value `text-lg` → `text-base`. Delete the `<p>` description line.

- [ ] **T-2** [PARALLEL] — Strip nav links from header
  - Agent: `implementer`
  - Owns: `src/components/layout/header.tsx`
  - Satisfies: AC-001
  - Details: Remove `desktopNavItems` const and `<nav>` block. Unwrap the `flex items-center gap-6` grouping div so title + `v0.1` span sit directly inside the header flex. Drop unused imports (`Home`, `CheckSquare`, `Scan`, `Settings`, `DollarSign`, `Link`, `usePathname`, `cn`). Keep title, avatar dropdown, sign-out.

- [ ] **T-3** [PARALLEL] — Delete bottom nav + update dashboard layout
  - Agent: `implementer`
  - Owns: `src/components/layout/bottom-nav.tsx`, `src/app/(dashboard)/layout.tsx`
  - Satisfies: AC-002, AC-006
  - Details: Delete `bottom-nav.tsx`. In `layout.tsx`: remove the `BottomNav` import, remove the `<BottomNav />` JSX, change `<main className="flex-1 pb-20 md:pb-4">` → `<main className="flex-1 pb-4">`.

### Wave 2 — Dependent edit (waits on T-1)

- [ ] **T-4** [SEQUENTIAL, DEPENDS ON: T-1] — Remove `description` props from 15 NavCard usages
  - Agent: `implementer`
  - Owns: `src/app/(dashboard)/page.tsx`
  - Satisfies: AC-003 (partial), AC-005
  - Details: Delete the `description="..."` line from each of the 15 `<NavCard>` usages in `page.tsx`. No other changes. Must happen after T-1 so that TS type-checks against the updated interface (once description is removed from the interface, keeping the props would be a type error; once the props are removed with description still in the interface, it's only an unused-prop lint warning — so order is T-1 then T-4 to stay green).

### Wave 3 — Review + verification

- [ ] **T-5** [SEQUENTIAL, DEPENDS ON: T-1..T-4] — code-reviewer gate
  - Agent: `code-reviewer`
  - Owns: read-only
  - Verifies: spec compliance, type-check passes, lint passes, no stray references to removed symbols (`BottomNav`, `desktopNavItems`, `description` on NavCard).

- [ ] **T-6** [SEQUENTIAL, DEPENDS ON: T-5] — Manual visual verification
  - Owner: human (Maged) — executed during quick-release
  - Runs TC-001 through TC-007 below.

## Test cases

### TC-001 [MANUAL] — AC-001 — Header shows only title + avatar
- Steps: Load `/` in Chrome at ≥ 1280×900. Inspect the header region.
- Expected: Header shows "BOCTOR Family Hub" + "v0.1" on the left and the avatar circle on the right. No Home / Tasks / Financials / Scan / Settings links anywhere in the header.

### TC-002 [MANUAL] — AC-002 — No bottom nav on mobile
- Steps: Open DevTools, switch to mobile emulation (390×844), reload `/`. Scroll to the bottom.
- Expected: No fixed bottom nav bar. Nothing overlaps content at the bottom. DOM search for "bottom-nav" or `<nav class*="fixed bottom-0"` returns nothing.

### TC-003 [MANUAL] — AC-003 — All 15 cards fit on one screen
- Steps: Load `/` in Chrome at 1280×900 and at 1440×900. Do not scroll. Count visible cards.
- Expected: All 15 NavCards visible (Tasks, Gmail Scanner, Accounts & Entities, Assumptions & Rules, Import Statements, Detect Transfers, Categorise, Duplicate Detection, Financial Overview, Spending Analysis, Subscriptions, Statement Coverage, Tax Prep, Invoice Scanner, Vehicle Logbook). Section headings for "Tasks & Inbox", "Financials" (with sub-sections 1–5), and "Other Tools" all visible.
- Fallback if fails: further tighten (see spec assumption ASSUMPTION-001).

### TC-004 [MANUAL] — AC-004 — NavCard uses compact layout
- Steps: Inspect any rendered NavCard in DevTools.
- Expected: Outer div has `p-3`. Icon wrapper has `p-2 rounded-md`. Icon SVG is `h-4 w-4`. No `<p>` description element inside the card.

### TC-005 [AUTO-LIKE / BUILD] — AC-005 — No `description` prop on NavCard
- Steps: `grep -n 'description' src/components/ui/nav-card.tsx` and `grep -rn 'description=' src/app/\(dashboard\)/page.tsx | grep NavCard`.
- Expected: No matches. Also: `npx tsc --noEmit` (or the existing type-check script) passes with zero errors.

### TC-006 [MANUAL] — AC-006 — `<main>` padding updated
- Steps: Inspect `<main>` element in DevTools on any dashboard page.
- Expected: Class list includes `pb-4`, does not include `pb-20` or `md:pb-4`.

### TC-007 [MANUAL] — AC-007 — Back arrow still works from any sub-page
- Steps: Navigate to `/tasks`, `/financials`, `/scan`, `/settings`. On each, click the back arrow in the PageHeader.
- Expected: Each returns to `/`. Confirms home-as-hub pattern is intact.

### TC-008 [BUILD] — Regression: build passes
- Steps: `npm run build`.
- Expected: Next build succeeds with no errors. Lint passes.

## Completion criteria

- All 5 files in the spec are modified / deleted as described
- `npm run build` succeeds
- TC-001 through TC-008 all pass
- code-reviewer returns PASS
