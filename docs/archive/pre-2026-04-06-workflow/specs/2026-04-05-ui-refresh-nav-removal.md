---
Doc version: v0.1
Last updated: 2026-04-05
Status: SIGNED OFF
App version at last update: v0.1.0
Tier: 2 — Streamlined
---

# Spec — UI Refresh: Nav Removal + Compact NavCards

Only the non-obvious decisions are written down. Everything else follows existing codebase conventions.

## Schema changes

**None.** Pure UI/layout change.

## API changes

**None.** No endpoints touched.

## Auth / permissions

**None.** Header and dashboard layout already run inside `(dashboard)` route group which enforces auth via `auth()` in `layout.tsx`. No change.

## File-by-file changes

### 1. `src/components/ui/nav-card.tsx` (edit)

**Interface change:**
- Remove `description: string` from `NavCardProps`.

**Layout change (inside the `content` div):**
- Outer container padding: `p-5` → `p-3`.
- Icon container: `p-2.5 rounded-lg` → `p-2 rounded-md`.
- Icon size: `h-5 w-5` → `h-4 w-4`.
- Title: keep `text-sm font-semibold`.
- **Remove** the `<p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>` line entirely.
- Header row bottom margin: `mb-3` → `mb-2`.
- Stats row: `mt-3 pt-3` → `mt-2 pt-2`. Stats value size `text-lg` → `text-base`. Stats gap `gap-3` → `gap-2`.

### 2. `src/app/(dashboard)/page.tsx` (edit)

- Remove the `description="..."` prop from every `<NavCard>` usage (15 cards).
- No other changes — stats, icons, ordering, section grouping all stay.

### 3. `src/components/layout/header.tsx` (edit)

- Remove the `desktopNavItems` const.
- Remove the `<nav className="hidden md:flex ...">…</nav>` block.
- Remove the outer `<div className="flex items-center gap-6">` wrapper that grouped the title with the nav — the title + `v0.1` span become direct children of the flex container.
- Drop now-unused imports: `Home`, `CheckSquare`, `Scan`, `Settings`, `DollarSign` (from `lucide-react`), `Link` (from `next/link`), `usePathname` (from `next/navigation`), `cn` (from `@/lib/utils`).
- Keep: `User`, `LogOut` icons; `Avatar*`, `DropdownMenu*`; `signOut`; the `HeaderProps` type; title; avatar dropdown.

### 4. `src/components/layout/bottom-nav.tsx` (delete)

- Delete the entire file. It is imported only in `(dashboard)/layout.tsx`.

### 5. `src/app/(dashboard)/layout.tsx` (edit)

- Remove `import { BottomNav } from '@/components/layout/bottom-nav'`.
- Remove `<BottomNav />` JSX from the return.
- Change `<main className="flex-1 pb-20 md:pb-4">` → `<main className="flex-1 pb-4">`. The `pb-20` existed only to clear the fixed bottom nav on mobile.

## Validation / error handling

**None required.** No inputs, no network calls, no state.

## Visual verification gate (MANUAL)

Because this is a layout-only change with no automated DOM assertions in the project, the ACs are validated via manual visual inspection at the desktop breakpoint (≥ 1280×900) and at a mobile breakpoint (~ 390×844). See test cases in the plan doc.

## Rollback plan

Revert the commit. All five files are isolated to chrome + home page; no data or schema to migrate.
