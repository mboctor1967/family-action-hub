---
description: Single entry point for all new work. Sizes the work, writes a feature brief, executes, and ships — all in one command. Replaces new-feature, new-feature-high, quick-feature, hotfix, all phase-*, and release/quick-release.
argument-hint: "<feature description>"
---

# Feature — $ARGUMENTS

This is the only workflow command for development work. It handles sizing → brief → execute → release for any feature, bug fix, or refactor. Solo-developer flow: one brief, one sign-off gate before code, one release gate before commit.

## Step 0 — Read CLAUDE.md

Read `CLAUDE.md` in full. It defines:
- Tier scoring rules
- Brief structure
- Decision elicitation rules (load-bearing vs trivial)
- Conventions (TDD, AC traceability, release menus, AI cost transparency)

Do not re-explain CLAUDE.md to the user. Apply it.

## Step 1 — Size the work

Spawn an `explorer` sub-agent to quickly assess:
- Does any existing feature brief or archived doc cover this?
- Rough file count to touch
- Schema changes? API changes? Cross-domain impact?
- Is this a bug fix or new behaviour?

Apply the scoring from CLAUDE.md. Present a tier recommendation as a single table with all contributing factors. **One decision, not a menu per factor.** Example:

```
Feature: <one line>

Sizing score: N
- Schema: yes (+2)
- APIs: yes (+2)
- Cross-domain: no (0)
- Files: ~8 (+2)
- New components: yes (+1)
- ACs expected: ~6 (+2)
- Bug fix: no (0)

Recommended tier: HIGH

[1] HIGH — full brief (~300 lines, inline ADRs)
[2] MED  — standard brief (~150 lines)
[3] LOW  — minimal brief (goal + 1-3 ACs, skip decisions section)
```

Wait for the user to confirm or override the tier. Accept overrides without argument; note the override in the brief's header if it differs from the recommendation.

## Step 2 — Write the feature brief

Create `docs/features/YYYY-MM-DD-<slug>.md` with this structure:

```markdown
---
Feature: <name>
Date: YYYY-MM-DD
Tier: HIGH | MED | LOW
Status: DRAFT | SIGNED OFF | IN PROGRESS | SHIPPED
Target release: vX.Y.Z
App version at last update: vA.B.C
---

# <Feature name>

## Goal
One paragraph. Problem, user, outcome.

## User stories
- US-001 — As <role>, I want <action> so that <benefit>.
- US-002 — ...

## Key decisions  (HIGH + MED only — skip for LOW)

Only load-bearing decisions. Schema shape, API contracts, library picks that affect infra or cost, architecture patterns. NOT naming, spacing, layout alignment.

Format each as:

### DEC-1: <name>
Context: <one sentence>
- Option A: <description> — pros / cons / risk
- Option B: <description> — pros / cons / risk
- **Chosen: A** — <rationale>

If only one sensible answer exists, write it as a note, not an ADR: "Decision: use X because Y."

## Acceptance criteria
- AC-001 [MUST] — **Given** ... **When** ... **Then** ... — Risk: LOW | MED | HIGH
- AC-002 [SHOULD] — ...
- AC-003 [MUST] — ...

Priorities: MUST (required), SHOULD (strongly desired), COULD (nice), WON'T (explicitly out).

## Out of scope
- <explicit exclusion — one line each>

## Assumptions
- ASSUMPTION-001 — <statement> — Impact if wrong: <brief>

## Schema changes  (HIGH + MED only)
New tables, new columns, new indexes. Include the Drizzle field definitions inline.

## API sketches  (HIGH + MED only)
Endpoint path + auth + request/response shape + AC coverage. No deep contract spec unless the API is publicly exposed.

## Implementation tasks

### Wave 1 — <purpose>
- [ ] **T-1** — <task> · owns `<files>` · satisfies AC-001, AC-002 · test: TC-001, TC-002
- [ ] **T-2** — ...

### Wave 2 — <purpose>
- [ ] **T-3** — ...

Tasks are sized S (< 30 min) / M (< 2 hr) / L (< 4 hr — decompose).

## Test cases  (inline with tasks above — no separate doc)

- TC-001 [AUTO] — covers AC-001 — `src/lib/.../foo.test.ts`
- TC-002 [MANUAL] — covers AC-002 — Steps: ... — Expected: ...

Tag AUTO / MANUAL. Every AC has at least one TC. Build + type-check are implicit gates — don't write them as TCs.

## Cross-domain impact
One line or "None identified".

## Release notes  (filled in at the release gate, not now)

### User-facing
- (filled at release)

### QA  (HIGH tier only)
- (filled at release)

### Technical  (HIGH tier only)
- (filled at release)
```

**Decision elicitation rules during brief writing:**
- Present a **summary table of all decisions at the start** of the decisions section.
- Then walk the **load-bearing ones one at a time** with structured options.
- **Batch trivial decisions** into one turn with a compact "here are 4 choices I'm making inline — flag any you want to change" format.
- Never ask "any other concerns?" as a closing question. State your plan and move on.

### Sign-off before code
When the brief is complete, present a summary:
- N user stories
- N ACs (N MUST, N SHOULD)
- N load-bearing decisions resolved
- N tasks in N waves
- N test cases (N AUTO, N MANUAL)
- Cross-domain impacts

**Wait for: "SIGNED OFF"** before writing any code. If the user asks for changes, revise the brief and re-confirm. Update `Status: SIGNED OFF` in the header.

## Step 3 — Execute

Once SIGNED OFF, dispatch sub-agents wave-by-wave per the brief's implementation tasks section.

- **Fully parallel waves:** dispatch multiple `implementer` agents in a single message, one per task.
- **Sequential waves:** dispatch after dependencies complete.
- **TDD discipline (CLAUDE.md conventions):** every task writes a failing test first, then implementation.
- **After each wave:** dispatch a `code-reviewer` agent to verify spec compliance. Do NOT start the next wave until code-reviewer returns PASS. On FAIL, fix issues and re-review.
- **Tick task checkboxes** in the brief as agents complete tasks.

If a task is trivial (< 20 lines, one file, no test logic to verify), execute it directly instead of spawning an implementer sub-agent. Sub-agents are for parallelism and isolation, not ceremony.

Track progress with TodoWrite if the feature is MED or HIGH. For LOW, skip task tracking.

## Step 4 — Test execution

Run automated tests. Execute manual TCs with the user in the loop (present the list, ask them to walk through and report PASS/FAIL). Record results inline in the brief's test cases section and also in `docs/tests/execution-log.md`.

Deployment gate: if any MUST-priority AC has a FAIL result, **stop** — do not proceed to release. If SHOULD-priority FAILs exist, flag them to the user and ask whether to ship with the gap or fix first.

## Step 5 — Release gate

Pre-commit checklist (every item must be YES):
- [ ] Version bumped in `package.json`
- [ ] Brief updated with outcomes (test results, any deviations from plan)
- [ ] CHANGELOG.md entry added
- [ ] `npm run build` passes — show output
- [ ] `npx tsc --noEmit` passes — show output
- [ ] `npm run lint` passes on changed files — show output
- [ ] All MUST ACs have passing tests
- [ ] Release notes written (3-audience for HIGH, 1-paragraph for MED/LOW)

### Version bump menu

Read current version from `package.json`. Present:
```
Current: vX.Y.Z
Recommended: --<level> → vA.B.C
Rationale: <1 line>

[A] Patch → vA.B.C
[B] Minor → vA.B.C
[C] Major → vA.B.C
[D] Skip (WIP only)
```
Wait for answer.

### Release notes

For HIGH tier, write three sections inside the brief's "Release notes" block:
- **User-facing** — plain language, what the user can now do
- **QA** — TC-XXX refs, regression areas, edge cases to check
- **Technical** — schema changes, new env vars, new deps, breaking changes

For MED / LOW, write a single paragraph in the User-facing section + any env var notes.

### Deployment prep (folded from old phase-deploy)

Before the commit menu, confirm:
- Any new env vars documented in `docs/deployment.md` and added to Vercel project settings (ask the user to confirm Vercel side)
- Any DB migrations listed with apply order and rollback steps
- Smoke tests listed for post-deploy verification
- Rollback procedure documented (git revert + optional migration rollback)

If anything is missing, add it to the brief or deployment doc before proceeding to commit.

### Commit menu

Draft the commit message (format: `feat|fix|chore|refactor|docs|schema(scope): description [vX.Y.Z]` + 2–3 sentence body + Co-Authored-By trailer).

Present the staged file list + the menu:

```
What would you like me to do?
  [A] Stop — stage only, I'll commit manually
  [B] Commit only (local, no push, no tag)
  [C] Commit + tag vX.Y.Z (local, no push)
  [D] Commit + tag + push (triggers Vercel auto-deploy)
  [E] Commit + tag + push + verify Vercel deploy + record in docs/deployment.md
  [F] Full pipeline (E + smoke tests + deploy history entry)
  [G] Custom — tell me which steps
```

Wait. Do NOT run git commands until the user picks a letter.

For `[E]` and `[F]`, after the push completes:
- Confirm the Vercel deployment URL (user or `gh` CLI can verify)
- Append to `docs/deployment.md` history
- For `[F]`, walk through the smoke test list

For `[A]` / `[B]` / `[C]`, remind the user what still needs to happen (push, deploy, smoke) so nothing is forgotten.

## Step 6 — Close out

- Update `Status: SHIPPED` in the brief header
- Update `docs/CHANGELOG.md`
- Update Claude memory (`integrated_implementation_plan.md`) if the feature was tracked there
- If any follow-ups were discovered during execution, create stub notes in Claude memory for the next session — don't let them disappear

---

## Notes on when to deviate from this command

- **Debugging an unclear bug:** use `/project:debug` first to trace root cause, then come back here to write the fix.
- **Experimental / throwaway work:** skip the brief entirely. Write code, iterate. Don't pollute `docs/features/` with disposable experiments.
- **Pure dependency upgrades:** may not need a brief. Use a minimal LOW-tier brief or just a chore commit with notes in CHANGELOG.
- **Docs-only changes:** skip sizing and go straight to the change + commit. No brief needed.

Use judgment. The brief is a tool, not a ritual.
