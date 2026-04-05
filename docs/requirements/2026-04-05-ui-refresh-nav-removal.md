---
Doc version: v0.1
Last updated: 2026-04-05
Status: SIGNED OFF
App version at last update: v0.1.0
Tier: 2 — Streamlined
Tier override note: Sized as Tier 3 (score 2); upgraded to Tier 2 per hotfix skill's ">2 files" rule.
---

# UI Refresh — Nav Removal + Compact NavCards

## What we're building

The Boctor Family Hub currently has two navigation surfaces — a desktop header nav and a mobile bottom nav — that duplicate links already present as cards on the home page. Meanwhile, the home page has grown to 15 NavCards and no longer fits on a single viewport without scrolling. This refresh removes the duplicate nav bars (making the home page the sole navigation hub) and compacts NavCards so the full grid fits on one screen. This is a visual/layout cleanup with no behavioural changes: every sub-page already has a `<PageHeader>` with a back arrow to `/`, so navigation remains fully reachable.

Scope is the Admin/user (Maged) using the hub on desktop and mobile.

## User stories

- **US-001**: As the hub user, I want the home page to be the single navigation hub so that I don't see duplicate links in a top bar and a bottom bar.
- **US-002**: As the hub user, I want all 15 home cards visible on one screen (on a typical desktop viewport) so that I can see everything at a glance without scrolling.

## Key decisions

### DECISION 1 — NavCard `description` prop: remove vs. make optional
- **Option A: Remove the `description` prop entirely** — Recommended ✓ because NavCard is only used on the home page (verified via grep — 2 files: definition + usage) and the user has explicitly said descriptions are no longer useful. Dead props invite future misuse.
- **Option B: Keep `description` as optional** — Trade-off: preserves backwards compatibility for a hypothetical future caller, but adds conditional rendering cruft for a prop the one known caller won't pass.
- **Decision: A** (remove)

### DECISION 2 — BottomNav file: delete vs. keep but unused
- **Option A: Delete the file** — Recommended ✓ because it's only imported in `(dashboard)/layout.tsx`. Leaving unused nav components around invites regression ("why isn't this rendering?"). Git history preserves it.
- **Option B: Keep the file, just stop importing it** — Trade-off: easier to revert but leaves dead code.
- **Decision: A** (delete)

### DECISION 3 — Header desktop nav removal: strip links vs. delete file
- **Option A: Strip the `desktopNavItems` list and `<nav>` element from header.tsx, keep title + avatar dropdown** — Recommended ✓ because the header still renders (title + avatar + sign-out), only the link list goes away. Also drop the now-unused `usePathname`, `Link`, `cn`, and nav-specific icon imports.
- **Option B: Replace header with a new minimal component** — Trade-off: unnecessary churn; same effect with more file movement.
- **Decision: A** (strip in place)

## Acceptance criteria

- **AC-001 [MUST]**: Given the user is on any dashboard page, when the page renders, then the header shows only the "BOCTOR Family Hub" title and the avatar dropdown (no nav links).
- **AC-002 [MUST]**: Given the user is on any dashboard page on a mobile viewport, when the page renders, then no bottom nav bar is visible and no `<BottomNav>` component is mounted in the DOM.
- **AC-003 [MUST]**: Given the user is on the home page at a desktop viewport (≥ 1280px wide, 900px+ tall), when the page renders, then all 15 NavCards (Tasks, Gmail Scanner, Accounts & Entities, Assumptions & Rules, Import Statements, Detect Transfers, Categorise, Duplicate Detection, Financial Overview, Spending Analysis, Subscriptions, Statement Coverage, Tax Prep, Invoice Scanner, Vehicle Logbook) plus their section headers are visible without scrolling.
- **AC-004 [MUST]**: Given the NavCard component, when rendered, then it uses `p-3` (not `p-5`), shows no description paragraph, and the icon container is smaller (`p-2` with `h-4 w-4` icon instead of `p-2.5` with `h-5 w-5`).
- **AC-005 [MUST]**: Given the NavCard TypeScript interface, when inspected, then it has no `description` prop.
- **AC-006 [MUST]**: Given the dashboard layout, when rendered, then the `<main>` element no longer has `pb-20 md:pb-4` padding (the bottom nav is gone).
- **AC-007 [SHOULD]**: Given any sub-page, when the user clicks the back arrow in the PageHeader, then they navigate to `/` — confirming the home-as-hub pattern still works.

## Assumptions

- **ASSUMPTION-001**: 15 NavCards can fit on one screen at a desktop viewport (≥ 1280×900) with a 3-column grid, `p-3` padding, and no description text. Impact if wrong: we'd need to further compress (2-stat minimum, smaller fonts) or accept a minor scroll on some viewports.
- **ASSUMPTION-002**: Removing the `description` prop won't break any caller outside the home page. Verified via grep — NavCard is imported only in `src/app/(dashboard)/page.tsx`. Impact if wrong: N/A (verified).
- **ASSUMPTION-003**: The avatar dropdown in the header is sufficient for sign-out discoverability. Impact if wrong: user may struggle to find sign-out; mitigation is trivial (still reachable via click on avatar, no change from current).

## Out of scope

- Redesigning the header beyond removing nav links.
- Adding a hamburger or drawer as a fallback nav.
- Reordering or regrouping home cards.
- Changing card stats (those are per `home_card_stats.md` and are already in place).
- Animations or transitions on card hover beyond what already exists.
- Tablet-specific breakpoint tuning (fit-on-one-screen is defined against desktop ≥ 1280×900; tablet and mobile may scroll).

## Cross-app impact

**Affected domains:** None beyond the global layout and home page. The four files are all shared chrome or the home page itself. No API, schema, auth, or other domain (Tasks, Financials, Scan, Settings) is touched. Every sub-page already has its own `<PageHeader>` with back arrow, so navigation remains intact without the nav bars.
