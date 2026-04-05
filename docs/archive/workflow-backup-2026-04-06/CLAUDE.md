@AGENTS.md

# Project Intelligence — CLAUDE.md

## What This Is

Boctor Family Hub — a single Next.js app serving as a family portal with multiple functional domains (mini-apps), each accessible from the home page card grid.

## Project Structure

This is a single Next.js App Router project. Each domain (Tasks, Financials, Scan, Settings, etc.) is a logical mini-app with its own pages, API routes, and components:

| Domain | Pages | API | Components |
|--------|-------|-----|------------|
| Tasks | `src/app/(dashboard)/tasks/` | `src/app/api/tasks/` | `src/components/tasks/` |
| Financials | `src/app/(dashboard)/financials/` | `src/app/api/financials/` | `src/components/financials/` |
| Scan | `src/app/(dashboard)/scan/` | `src/app/api/scan/` | — |
| Settings | `src/app/(dashboard)/settings/` | `src/app/api/settings/` | — |

Shared UI components live in `src/components/ui/` (PageHeader, StatCard, NavCard, EmptyState, DataTableContainer).

Shared libraries live in `src/lib/` (db, auth, assumptions, financials parsers, Google Drive client).

## Documentation Structure

```
docs/
├── CHANGELOG.md          — release log (newest at top)
├── requirements/          — feature requirement specs
├── specs/                 — technical design specs (per feature, dated)
├── plans/                 — implementation plans (per feature, dated)
├── tests/
│   ├── test-plan.md      — test strategy and case template
│   └── execution-log.md  — running log of test results
└── archive/              — superseded docs (kept for history)
```

Specs and plans are **feature-scoped and dated**: `docs/specs/2026-04-05-assumptions-crud.md`. Not one monolithic file per type.

## Workflow — Commands and Agents

All workflow is driven by custom commands (`.claude/commands/`) and agents (`.claude/agents/`).

### Feature Sizing — Always Assess Before Starting

Every piece of new work starts with `/project:new-feature`. This sizes the work and routes to the right tier:

| Tier | Trigger | Command | Process |
|------|---------|---------|---------|
| HIGH | Schema changes, new APIs, 5+ ACs, cross-domain | `/project:new-feature-high` | Full 9-phase SDLC with sub-agent waves |
| MEDIUM | Self-contained, 2-4 ACs, familiar pattern | `/project:quick-feature` | 5-phase streamlined workflow |
| LOW | Bug fix, UI tweak, 1-2 files | `/project:hotfix` | Fix + test + release |

Sizing score: Schema +2, New APIs +2, Cross-domain +2, New UI components +1, Files > 5 +2, Files 2-5 +1, New behaviour +1, ACs > 4 +2, ACs 2-4 +1, Bug fix -2. Score 7+ = HIGH, 3-6 = MEDIUM, 0-2 = LOW.

### Available Commands

| Command | Purpose |
|---------|---------|
| `new-feature` | Size and route any new work |
| `new-feature-high` | Full SDLC (Tier 1) |
| `quick-feature` | Streamlined (Tier 2) |
| `hotfix` | Minimal fix workflow (Tier 3) |
| `debug` | Systematic root-cause debugging |
| `phase-requirements` | Requirements gathering |
| `phase-design` | Technical design |
| `phase-spec` | Spec writing |
| `phase-plan` | Implementation planning |
| `phase-execute` | Sub-agent orchestration |
| `phase-test-plan` | Test planning |
| `phase-test-results` | Test result documentation |
| `phase-deploy` | Deployment workflow |
| `release` | Pre-commit gate (mandatory) |
| `quick-release` | Lightweight release (Tier 2) |
| `pivot-audit` | Audit existing work against framework |

### Available Agents

| Agent | Role |
|-------|------|
| `explorer` | Read-only research (all tiers) |
| `implementer` | One task, follows TDD (Tier 1 + 2) |
| `test-writer` | Automated tests only (Tier 1 + 2) |
| `code-reviewer` | Two-stage review: spec compliance then code quality (Tier 1 + 2) |
| `doc-updater` | Docs only, never source code (Tier 1 + 2) |

## Communication Style — Succinct and Structured

User's preferred style is **succinct and structured**. Apply to every response:

- **Lead with the answer, not the reasoning.** One sentence of context max, then the answer. Expand only if the user asks.
- **Prefer tables, lists, and headings over prose paragraphs.** If something fits in a 3-column table, don't write it as three sentences.
- **Cut filler.** No "Great question", no "Let me explain", no "Hope this helps", no recapping what the user just said.
- **No trailing summaries.** The user can read the output; don't paraphrase what you just wrote.
- **One idea per bullet.** Multi-clause bullets with "and also…" should be split.
- **Skip defensive hedging** ("it depends", "there are many ways", "as I mentioned") unless the uncertainty is genuinely load-bearing.
- **If a tool call or action answers the question, do the action and show the result.** Don't narrate what you're about to do.

When in doubt, **shorter is better**. The user will ask for more detail if they need it. Feedback memory: `feedback_communication_style.md`.

## Interaction Style — Decision Elicitation

When a phase or workflow requires multiple decisions from the user (requirements, design, spec, options menus), **do not dump all questions at once**. Instead:

1. **Start with a summary table** of every decision that needs an answer in this round. One row per decision: `#`, short name, one-line context, recommended option. This gives the user the full scope up front.
2. **Then ask ONE question at a time**, in detail: the full context, all options with pros/cons/risk, the recommendation with rationale, and a clear "Decision: [A] [B] [C]…" line.
3. **Wait for the user's answer** before presenting the next question.
4. **Track progress** visibly — e.g. "Question 3 of 7" at the top of each detailed question.
5. **Never batch multiple detailed questions** in a single reply, even if they seem related. The user will tell you to batch if they want to.

This applies to `phase-requirements`, `phase-design`, `phase-spec`, and any other workflow that presents structured options with recommendations. Feedback memory: `feedback_decision_elicitation.md`.

## Code Standards

**Naming:**
- Files: kebab-case
- Components: PascalCase
- Functions/vars: camelCase
- Constants: UPPER_SNAKE_CASE
- DB tables: snake_case

**Commit format:** `feat|fix|chore|refactor|docs|schema(scope): description`

**Auth pattern (all financial APIs):**
```typescript
const session = await auth()
if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

**UI conventions:**
- Card radius: `rounded-2xl`, padding: `p-5`
- Inline box radius: `rounded-lg`
- Button radius: `rounded-md`
- Page spacing: `space-y-6`
- All pages use `<PageHeader>` with back arrow defaulting to `/`

**Form patterns:**
- Plain `useState` (no react-hook-form)
- `fetch()` for API calls (no React Query)
- `react-hot-toast` for notifications
- Dialog for create/edit (compact forms), full page for complex flows

## Cross-Domain Impact Rule

When a change is made in one domain, check: does this affect any other domain?

Check for shared: data models, API endpoints, UI components, auth/permissions logic, environment variables.

If impact found: flag it before proceeding.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Database:** Neon Postgres via Drizzle ORM
- **Auth:** Google OAuth via NextAuth
- **UI:** Shadcn UI (base-ui variant) + Tailwind CSS
- **Deployment:** Vercel
- **Migrations:** `npx drizzle-kit push` (load .env.local first)

## Current Implementation Status

See the integrated implementation plan in Claude memory for current phase status. As of April 2026: Phases A-C, 1-2, and D are complete. Next: Phase F (Tax Prep).
