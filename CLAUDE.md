# Project Intelligence — CLAUDE.md

## Project Structure
This is a multi-app project. Each app lives under /apps/<app-name>/.
Root-level /docs/ holds cross-cutting documentation.
Each app has its own /apps/<app-name>/docs/ for app-specific docs.

When starting any task, first identify which app(s) are affected.

---

## Methodology
Superpowers is installed. It owns:
- TDD enforcement (red-green-refactor)
- Brainstorming facilitation
- Write-plan structure and discipline
- Debugging root-cause methodology
- Code review methodology

Do not reimplement these. Invoke Superpowers skills when relevant.
The rules below are project-specific additions Superpowers does not cover.

---

## First-Run Pivot Rule
If this file was just added to an existing in-progress project:
  Run /project:pivot-audit first.
This audits what already exists and maps it to the framework
without overwriting anything that is already good.

---

## Feature Sizing — Always Assess Before Starting

Every piece of new work starts with /project:new-feature.
This command sizes the work and routes to the right tier.
Never jump directly to a phase command without sizing first.

### Tier 1 — HIGH → /project:new-feature-high
Full 9-phase SDLC. Full docs. Sub-agent wave orchestration.
Three-audience release notes. MINOR version bump.

Indicators: schema changes, new API endpoints, cross-app impact,
new UI components, 5+ ACs, estimated > 1 day.

### Tier 2 — MEDIUM → /project:quick-feature
5-phase streamlined workflow. Combined requirements + design.
Lightweight spec. Sub-agents for execution. PATCH or MINOR bump.

Indicators: self-contained, single app, no schema changes,
2–4 ACs, familiar pattern, estimated 2–8 hours.

### Tier 3 — LOW → /project:hotfix
3-step minimal workflow. Fix + test + release note.
No new docs. Patch version bump only.

Indicators: bug fix, copy change, UI tweak, 1–2 files,
no new behaviour, estimated < 2 hours.

### Sizing score cheat sheet
Schema changes: +2 | New API endpoints: +2 | Cross-app impact: +2
New UI components: +1 | Files > 5: +2 | Files 2–5: +1
New user behaviour: +1 | ACs > 4: +2 | ACs 2–4: +1
Is a bug fix: -2

Score 7+ = Tier 1 | Score 3–6 = Tier 2 | Score 0–2 = Tier 3

---

## Documentation Lifecycle — Always On

At every phase, the corresponding doc MUST be current before
proceeding to the next phase. Never write code before upstream
docs are signed off. Never close a phase without updating its doc.

### Phase → Doc Mapping

| Phase               | Root doc                          | Per-app doc                             |
|---------------------|-----------------------------------|-----------------------------------------|
| Requirements        | /docs/requirements.md             | /apps/<app>/docs/requirements.md        |
| Design & UI         | /docs/design.md                   | /apps/<app>/docs/design.md              |
| Technical Spec      | /docs/spec.md                     | /apps/<app>/docs/spec.md                |
| Implementation Plan | /docs/implementation-plan.md      | /apps/<app>/docs/implementation-plan.md |
| Architecture        | /docs/architecture.md             | /apps/<app>/docs/architecture.md        |
| Test Plan           | /docs/test-plan.md                | /apps/<app>/docs/test-plan.md           |
| Test Cases          | /docs/test-cases.md               | /apps/<app>/docs/test-cases.md          |
| Test Results        | /docs/test-results.md             | /apps/<app>/docs/test-results.md        |
| Release Notes       | /docs/release-notes.md            | /apps/<app>/docs/release-notes.md       |
| Deployment          | /docs/deployment.md               | /apps/<app>/docs/deployment.md          |
| Changelog           | /docs/changelog.md                | /apps/<app>/docs/changelog.md           |

Tier 2 and Tier 3 use a subset of these docs — see tier commands.

### Lifecycle Rules
- Before a phase: read the existing doc if it exists
- After a phase: update the doc before marking done
- After a significant change: check if downstream docs need updating
- Commit messages must list docs updated: [docs: spec, test-plan]
- Never overwrite a doc section without reading it first
- Extend existing docs — do not replace them

---

## Doc Versioning

Every doc file carries its own version in its header:

  Doc version: v0.1
  Last updated: YYYY-MM-DD
  Status: DRAFT | IN REVIEW | SIGNED OFF
  App version at last update: v0.x.x
  Tier: 1 | 2 | 3

+0.1 when sections are added or materially changed.
+0.0.1 for corrections or minor clarifications.
Never reset doc version — it is a permanent history indicator.

---

## Doc Format — Markdown and Word

The .md file is always the source of truth. Claude reads and writes
markdown. Never replace a .md with a .docx — they coexist.

After every phase sign-off, ask exactly this:

  "Doc saved to <path>.md — want a Word (.docx) version as well? [yes / no]"

If yes: use the docx skill to convert the .md to .docx and save it
alongside the markdown with the same filename:
  /apps/<app>/docs/requirements.md   ← source of truth
  /apps/<app>/docs/requirements.docx ← shareable copy

If no: move on immediately. Do not ask again for the same doc
in the same session.

Only ask once per doc per session. Never ask for hotfix docs —
Tier 3 is too lightweight to be worth it.

---

## App Versioning

Format: MAJOR.MINOR.PATCH

Pre-1.0 rules:
  0.x.0  — new feature completed (Tier 1 or Tier 2 MINOR)
  0.0.x  — bug fix or minor improvement (Tier 2 PATCH or Tier 3)
  1.0.0  — first production-ready release

Version bump happens inside the release command BEFORE commit.
Never bump version after committing.
Git tag must match version: git tag v0.x.x

---

## Cross-App Impact Rule

When a change is made in one app, Claude MUST check:
Does this affect any other app in the group?

Check for shared: data models, API endpoints, UI components,
auth/permissions logic, environment variables.

If impact found: flag it before proceeding and update the
affected app's docs before continuing.

---

## Sub-Agent Orchestration Rules

Tier 1: full wave orchestration (phase-execute)
Tier 2: single implementer + test-writer pair
Tier 3: no sub-agents — direct implementation

For Tier 1 parallel spawning:
- Max 4 parallel agents at once
- Code-reviewer gates every wave before next wave starts
- Background long-running agents with Ctrl+B, monitor with /tasks
- Every agent gets: owned files, forbidden files, doc to update, definition of done

### Available custom agents
- explorer       → read-only research (all tiers)
- implementer    → one task, defers TDD to Superpowers (Tier 1 + 2)
- test-writer    → automated tests only (Tier 1 + 2)
- code-reviewer  → Superpowers review + project checks (Tier 1 + 2)
- doc-updater    → docs only, never source code (Tier 1 + 2)

---

## Code Standards (all tiers)

Naming: files kebab-case | components PascalCase
        functions/vars camelCase | constants UPPER_SNAKE_CASE
        DB tables snake_case

Documentation: JSDoc with @param, @returns, @example on all
exported functions and components. No function > 40 lines
without an intent comment.

Git pre-commit gate: /project:release (or /project:quick-release
for Tier 2, built into /project:hotfix for Tier 3) must complete
before any commit. Lint and type-check must pass.

Commit format: feat|fix|chore(scope): description [docs: list] [vX.X.X]
