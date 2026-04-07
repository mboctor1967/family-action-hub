@AGENTS.md

# Project — Boctor Family Hub

Single Next.js App Router project. Family portal with multiple functional domains (Tasks, Financials, Scan, Settings) accessible from a home-page card grid. Solo developer: **Maged Boctor**, admin of the hub.

## Structure

```
src/
├── app/(dashboard)/{domain}/       — pages per domain
├── app/api/{domain}/               — API routes per domain
├── components/{domain}/            — domain-specific components
├── components/ui/                  — shared UI (PageHeader, StatCard, NavCard, EmptyState, DataTableContainer)
└── lib/                            — db, auth, Drive client, financials parsers, etc.

docs/
├── features/                       — one file per feature (the "brief" — see Workflow below)
├── CHANGELOG.md                    — release log, newest at top
├── tests/execution-log.md          — running log of test results
├── archive/                        — superseded docs
└── reference/                      — long-lived reference data (e.g. ATO codes workbook)
```

Feature briefs are **dated + scoped**: `docs/features/2026-04-06-phase-f-tax-prep.md`.

## Tech stack

- **Framework:** Next.js (App Router). NOT the Next.js you know from training — read `node_modules/next/dist/docs/` before writing Next.js code. Heed deprecation notices.
- **DB:** Neon Postgres via Drizzle ORM. Migrations via `npx drizzle-kit push` (load `.env.local` first).
- **Auth:** Google OAuth via NextAuth.
- **UI:** Shadcn UI (base-ui variant) + Tailwind CSS.
- **Deployment:** Vercel.

## Workflow — one command, one brief per feature

Every piece of new work runs through **`/project:feature`**. That single command handles sizing, brief writing, implementation, and release. No separate phase commands.

**Tier scoring** (applied in `/project:feature`):
- Schema changes +2
- New API endpoints +2
- Cross-domain impact +2
- Files touched >5 +2; 2–5 +1
- New UI components +1
- New user behaviour +1
- ACs expected >4 +2; 2–4 +1
- Bug fix −2

**Tiers:**
| Score | Tier | Brief scope | Release cmd |
|---|---|---|---|
| 0–2 | LOW | Minimal brief (goal + 1–3 ACs) | patch |
| 3–6 | MED | Standard brief (~150 lines) | patch or minor |
| 7+ | HIGH | Full brief (~300 lines, inline ADRs) | minor |

## The feature brief (single doc per feature)

One file at `docs/features/YYYY-MM-DD-feature-name.md` containing:

1. **Sizing + tier** (header block)
2. **Goal + user stories**
3. **Key decisions** (inline ADR-style — only load-bearing: schema, APIs, cost, architecture)
4. **Acceptance criteria** (Given/When/Then, MoSCoW priority, one ID per AC)
5. **Schema / API sketches**
6. **Implementation tasks** (checklist with test cases inline per task)
7. **Release notes** (filled in at release time, 3 audiences for HIGH, 1 para for LOW/MED)
8. **Cross-domain impact** (1 line or "none")

Sign-off gates: **one** before coding (brief signed off) + **one** before commit (release gate). Not nine.

## Agents (5 total, all specialized)

| Agent | Role |
|---|---|
| `explorer` | Read-only research. Files, code, gaps. Never modifies. |
| `implementer` | Executes ONE task. TDD discipline. Only touches owned files. |
| `test-writer` | Writes tests only. Never touches application source. |
| `code-reviewer` | Two-stage review (spec compliance then quality). Read-only. Returns PASS/FAIL. Blocks next wave on FAIL. |
| `doc-updater` | Docs only. CHANGELOG, architecture notes, deployment. Never source code. |

## Conventions — applies to every feature

### Communication style
- **Succinct and structured.** Lead with the answer. Tables over prose. No filler, no recap, no trailing summaries.
- **Decision elicitation:**
  - **Load-bearing decisions** (schema, APIs, cost, architecture, library picks that affect bundle/infra): one at a time with structured options (A/B/C + pros/cons/risk + recommendation).
  - **Trivial decisions** (naming, spacing, non-architectural style choices): decide inline with a one-line mention. Don't force options menus.
  - **Summary table first**, then one-by-one for the load-bearing batch.
- **Succinct and direct.** Ask the minimum needed to unblock.

### TDD discipline
1. Write a failing test first
2. Watch it fail (proves test catches the issue)
3. Minimal implementation to pass
4. Refactor
5. Run full suite, confirm nothing regressed

### AC traceability
- Every AC in the brief has at least one task.
- Every task references the AC(s) it satisfies.
- Every test case references the AC(s) it covers.
- Release notes reference ACs and test results.

### Commit and deploy discipline
- **NEVER commit or deploy without explicit user instruction.** Do not auto-commit after completing work. Do not auto-deploy after pushing. Wait for the user to say "commit", "push", "deploy", or similar.
- This applies even after completing a feature, fixing a bug, or passing all checks. The user decides when to commit.
- **After completing any code change**, restart the local dev server on `localhost:3000` so the user can test immediately. Kill any existing dev server process first, then run `npm run dev`. The user tests locally before deciding to commit.

### Release gate (mandatory before commit)
- Pre-commit checklist: version bumped, tests pass, lint pass, type-check pass, brief updated with actual outcomes.
- **Option menu** for commit/push/deploy — never auto-push or auto-deploy:
  - `[A]` Stop — stage only, commit manually
  - `[B]` Commit only (local, no push, no tag)
  - `[C]` Commit + tag (local, no push)
  - `[D]` Commit + tag + push (triggers Vercel auto-deploy)
  - `[E]` Commit + tag + push + verify deploy + record in deployment log
  - `[F]` Full pipeline (E + smoke tests + deploy history entry)
  - `[G]` Custom
- **Version bump menu** at the same gate: `[A]` patch / `[B]` minor / `[C]` major / `[D]` skip.

### AI cost transparency
- Any feature that calls a paid AI API must include a **user-toggleable switch** (default OFF) and a **live cost estimate** (per-run, monthly, backfill) shown before the user enables it.

### Cross-domain check
Before every task: does this change affect shared models, APIs, UI components, auth, or env vars in other domains? If yes, flag before proceeding.

## Code standards

**Naming:** files kebab-case · components PascalCase · functions/vars camelCase · constants UPPER_SNAKE_CASE · DB tables snake_case.

**Commit format:** `feat|fix|chore|refactor|docs|schema(scope): description [vX.Y.Z]`

**Auth pattern (all admin APIs):**
```typescript
const session = await auth()
if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

**UI conventions:**
- Card radius: `rounded-2xl` · Inline box: `rounded-lg` · Button: `rounded-md`
- Page spacing: `space-y-6` · Card padding: `p-5` (compact NavCard: `p-3`)
- All sub-pages use `<PageHeader>` with back arrow to `/`

**Form patterns:**
- Plain `useState` (no react-hook-form)
- `fetch()` for API calls (no React Query)
- `react-hot-toast` for notifications
- Dialog for create/edit (compact forms), full page for complex flows

## Current status

See `docs/features/` for the latest feature brief and `docs/CHANGELOG.md` for release history. The integrated implementation plan lives in Claude memory (`integrated_implementation_plan.md`) and tracks phase completion across v0.1.x → v1.0.
