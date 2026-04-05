# Phase D: Assumptions CRUD — Design Spec

## Overview

A CRUD page at `/financials/assumptions` for managing financial assumptions (WFH %, phone %, vehicle method, etc.) per financial year and entity. Assumptions drive tax calculations and reporting downstream.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Create/Edit UI | Dialog | Compact form (~6 fields), matches Entities pattern |
| List organization | FY tabs → Entity sections | Review assumptions as a complete FY set, see per-entity breakdown |
| Copy forward | Copy all entities at once | Typical workflow is rolling forward entire FY |
| FY values | Auto-calculated | Current FY, previous, next — based on July 1 AU tax year cutoff |
| Stat cards scope | Per selected FY | Stats reflect the active FY tab |

## Page Layout

### Header
- `<PageHeader title="Assumptions & Rules" subtitle="WFH %, phone %, vehicle % — set your FY assumptions" />`
- Action slot: "Copy from [prev FY]" button (outline) + "+ Add Assumption" button (primary)

### FY Tabs
- Auto-calculated from current date using July 1 AU tax year boundary
- Shows 3 tabs: previous FY, current FY, next FY (e.g., FY2025, FY2026, FY2027)
- Default to current FY on page load

### Stat Cards (scoped to selected FY)
Three `<StatCard>` components in a row:
1. **Total Assumptions** — count of assumptions in selected FY
2. **Entities Covered** — "3 / 4" format (entities with assumptions / total entities)
3. **Approved** — "8 / 12" format (approved count / total in FY)

### Entity Sections
For each entity that has assumptions in the selected FY:
- Card with entity name + color dot in header + assumption count badge
- Table columns: Type, Value, Rationale, Approved, Actions (⋯ menu)
- ⋯ menu contains: Edit, Delete (with confirmation)
- Entities with no assumptions for the selected FY are not shown

### Empty State
When the selected FY has no assumptions at all:
- `<EmptyState>` with icon, "No assumptions for [FY]" headline
- CTA: "+ Add Assumption" button
- Secondary text: "Or copy from [prev FY] to get started"

## Dialog Form

Shared dialog for both create and edit. Fields:

| Field | Type | Notes |
|-------|------|-------|
| FY | Select dropdown | Pre-filled with active tab. Options: auto-calculated 3 FYs |
| Entity | Select dropdown | Populated from `financialEntities` |
| Assumption Type | Select dropdown | See type catalogue below |
| Value | Conditional | Numeric input for percentages/hours; Select for enum types (home_office_method, vehicle_method) |
| Rationale | Textarea | Optional but encouraged. 1-2 sentences explaining "why" |
| Approved By | Text input | Optional. Sets `approvedDate` to now when filled |

### Assumption Type Catalogue

| Type key | Display label | Value type | Notes |
|----------|--------------|------------|-------|
| `wfh_hours_per_week` | WFH Hours/Week | Numeric (hours) | For fixed-rate 67c/hr method |
| `home_office_method` | Home Office Method | Enum: `fixed_rate_67c`, `actual_cost` | ATO revised fixed rate 67c/hr (from 1 July 2022) |
| `home_office_floor_area_pct` | Home Office Floor Area % | Numeric (%) | Only relevant if method = actual_cost |
| `phone_business_pct` | Phone Business % | Numeric (%) | |
| `internet_business_pct` | Internet Business % | Numeric (%) | |
| `vehicle_method` | Vehicle Method | Enum: `logbook`, `cents_per_km` | |
| `vehicle_business_pct` | Vehicle Business % | Numeric (%) | Only relevant if method = logbook |
| `utilities_business_pct` | Utilities Business % | Numeric (%) | For business entities |
| `entertainment_deductible_pct` | Entertainment Deductible % | Numeric (%) | Typically 50% |

### Validation
- FY, Entity, and Type are required
- Value is required:
  - Percentage fields: must be > 0 and <= 100
  - Hour fields (wfh_hours_per_week): must be > 0
  - Enum fields: must match a valid option
- Duplicate check: same FY + Entity + Type cannot exist twice (enforced at DB level via unique index + application-level toast error)
- `entityId` is required in the form (no global/entity-less assumptions)

## Copy from Previous FY

- Button in page header: "Copy from [N-1]" — relative to the **selected FY tab** (not the calendar year)
  - If FY2026 tab is selected, button says "Copy from FY2025" and copies FY2025 → FY2026
  - If FY2027 tab is selected, button says "Copy from FY2026" and copies FY2026 → FY2027
- Copies all assumptions from source FY to target FY for all entities
- Skips any combination where FY + Entity + Type already exists in target FY
- Shows toast: "Copied X assumptions from [source FY]" or "Nothing to copy — [source FY] has no assumptions"
- Disabled if source FY has no assumptions

## API Routes

### `GET /api/financials/assumptions`
- Query params: `?fy=FY2026` (optional filter)
- Returns assumptions with entity relation joined
- Admin-only

### `POST /api/financials/assumptions`
- Body: `{ fy, entityId, assumptionType, valueNumeric?, valueText?, rationale?, approvedBy? }`
- Validates no duplicate (fy + entityId + assumptionType)
- Sets `approvedDate` to now if `approvedBy` is provided
- Admin-only

### `PATCH /api/financials/assumptions/[id]`
- Body: partial update fields
- If `fy`, `entityId`, or `assumptionType` are changed, re-validate uniqueness constraint
- Admin-only

### `DELETE /api/financials/assumptions/[id]`
- Deletes single assumption
- Admin-only

### `POST /api/financials/assumptions/copy`
- Body: `{ fromFy, toFy }`
- Copies all assumptions from `fromFy` to `toFy`, skipping duplicates
- Returns `{ copied: number, skipped: number }`
- Admin-only

## Schema Migration

Add a unique index to enforce the (fy, entityId, assumptionType) constraint at the DB level:

```
uniqueIndex('idx_fin_assumptions_fy_entity_type').on(table.fy, table.entityId, table.assumptionType)
```

This replaces the existing non-unique `idx_fin_assumptions_fy_entity` index.

## Value Display Formatting

| Value type | Display format | Example |
|-----------|---------------|---------|
| Percentage | `{value}%` | "40%" |
| Hours | `{value} hrs` | "20 hrs" |
| Enum: `fixed_rate_67c` | "Fixed rate (67c/hr)" | |
| Enum: `actual_cost` | "Actual cost" | |
| Enum: `logbook` | "Logbook" | |
| Enum: `cents_per_km` | "Cents per km" | |

## File Structure

| File | Purpose |
|------|---------|
| `src/app/(dashboard)/financials/assumptions/page.tsx` | Server component — auth check, render AssumptionsView |
| `src/components/financials/assumptions-view.tsx` | Client component — all page interactivity |
| `src/app/api/financials/assumptions/route.ts` | GET (list) + POST (create) |
| `src/app/api/financials/assumptions/[id]/route.ts` | PATCH (update) + DELETE |
| `src/app/api/financials/assumptions/copy/route.ts` | POST (copy from previous FY) |

## Home Page Update

Remove `badge="Coming soon"` and `disabled` from the Assumptions NavCard in `src/app/(dashboard)/page.tsx`.

## Patterns & Conventions

- Plain `useState` for form state (no react-hook-form)
- `fetch()` for API calls (no React Query)
- `react-hot-toast` for notifications
- Shadcn UI components: Dialog, Select, Input, Textarea, Button
- Shared components: PageHeader, StatCard, DataTableContainer, EmptyState
- Card styling: `rounded-2xl`, `p-5`
- Spacing: `space-y-6`

## Out of Scope

- Wizard for guided assumption setup (deferred)
- Conditional field visibility based on other assumptions (e.g., hiding floor area % when method = fixed rate) — keep it simple, show all types
- Bulk edit
- Assumption history / audit log
