# Tasks

Unified task list for the household — manual tasks + tasks auto-created from Gmail triage. Comments, subtasks, priorities, topics.

**Path ownership:** `src/app/(dashboard)/tasks/*`, `src/app/api/tasks/*`, `src/components/tasks/*`

## Shipped

- Pages: `/tasks` (filterable list), `/tasks/new`, `/tasks/[id]` (detail with comments + subtasks)
- APIs: task CRUD, comments, feedback, subtasks
- Components: `task-card`, `task-filters`, `tasks-list` (new — handles `?new=` highlight)
- **Part of the in-flight `feat/triage-simplification` branch** (see below):
  - `?new=<ids>` param support with auto-scroll + 2-second amber ring
  - Filter query-param preservation during URL cleanup

## In-flight

- **`feat/triage-simplification` branch** — tasks-side work is bundled with scan-side work (cross-domain — grandfathered before the single-domain rule was adopted). The Tasks slice is: `TasksList` client component, `?new=` highlight handling, optional `highlight` prop on TaskCard. Ready for release.

## Queued (next)

1. **Ship the triage simplification merge** — see `scan.md` for the coupled release plan.
2. **Recurring tasks UI** — schema supports `isRecurring` + `recurrenceRule` (tasks table) but no UI to set/manage them. Currently dead fields.
3. **Snooze UI** — schema has `snoozedUntil` but no user-facing way to snooze.
4. **Bulk actions on task list** — multi-select + bulk status-change / reassign / delete. Natural follow-on to the triage simplification's "commit batch of decisions" pattern.
5. **Topics tree editor** — topics schema supports parent/child but there's no UI to rearrange the tree.

## Deferred

- None explicitly.

## Gaps / rough edges

- Task detail page has `wip(task-triage)` snapshot commits in history (`145f3e8`, `912b9df`) — need audit for dead code left from the pre-simplification flow once the new triage ships.
- No test coverage on task-card / tasks-list components.

## Related memory

- (No dedicated memory file — triage-related docs at `docs/features/2026-04-13-task-triage.md` belong conceptually to scan + tasks)
