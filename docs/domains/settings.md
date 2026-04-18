# Settings

Account configuration surface — Gmail account connection, AI toggles, cost transparency.

**Path ownership:** `src/app/(dashboard)/settings/*`, `src/app/api/settings/*`, `src/components/settings/*` (if any)

## Shipped

- Pages: `/settings` (single page)
- APIs: `ai-claude-toggle`, `ai-cost-estimate`, `connect-gmail`, `gmail-accounts`
- Components: `ai-cost-panel.tsx`
- AI cost panel pattern (per `feedback_ai_cost_transparency.md`) — any paid AI API must be user-toggleable, show a cost estimate, default OFF

## In-flight

- None.

## Queued (next)

1. **Topics management UI** — topics schema (tree) exists but topics are created implicitly by AI triage; no settings surface to rename/reorder/delete. Low urgency but natural home here.
2. **Profile / display name edit** — profiles table has `name`, `avatarUrl`, `preferences` JSONB, but no UI to edit them.
3. **Per-domain AI toggles** — currently Claude has a single on/off. As more domains use AI (categorize, ato-propose, dedupe), might need domain-scoped switches.

## Deferred

- None explicitly.

## Gaps / rough edges

- Very thin surface — most settings-type features are buried in other domain pages (e.g., invoice supplier config lives in Invoices, entity config in Financials). Not necessarily wrong but worth re-evaluating if Settings becomes underused.
- No test coverage.

## Related memory

- `feedback_ai_cost_transparency.md` (cross-cutting, enforced via the AI cost panel here)
