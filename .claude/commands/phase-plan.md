---
description: Create or update the Implementation Plan. Invokes Superpowers write-plan, annotates every task with parallelism classification, dependency mapping, and assigned sub-agent, and groups tasks into execution waves for phase-execute to orchestrate.
argument-hint: "<feature or app name>"
---

# Implementation Planning Phase — $ARGUMENTS

## Step 1 — Read Upstream Docs

Spawn two explorer sub-agents in parallel:

Explorer A — read:
- /docs/spec.md (technical decisions, API contracts, data models)
- /docs/requirements.md (acceptance criteria — every AC must map to a task)
- /docs/design.md (component breakdown)

Explorer B — read the codebase:
- Current file structure of affected apps
- Existing patterns for similar features
- Current test setup and conventions

Confirm spec is SIGNED OFF before proceeding.

## Step 2 — Check for Existing Plan

If /docs/implementation-plan.md already exists:
- Read it fully
- Identify completed tasks (ticked checkboxes)
- Identify in-progress tasks
- Identify remaining tasks
- Present a status summary before deciding to extend or create new

## Step 3 — Generate Plan via Superpowers

Invoke the Superpowers write-plan skill.

Every task must:
- Be specific enough for a developer with no prior context to execute
- Include exact file paths to create or modify
- Have a TEST step before the IMPLEMENT step
- Have a DOC UPDATE step at the end
- Be sized: S (< 30 min) | M (< 2 hr) | L (< 4 hr)
- Reference which AC(s) it satisfies

If any task is L, decompose it further.

## Step 4 — Annotate Every Task for Sub-Agent Execution

After the plan is generated, annotate EVERY task:

Parallelism:
  [PARALLEL]              — safe to run alongside other PARALLEL tasks
  [SEQUENTIAL]            — must run after dependencies complete
  [DEPENDS ON: task N,M]  — explicit dependency list

Assigned agent:
  Agent: implementer | test-writer | doc-updater
  (code-reviewer runs after each wave automatically — not assigned per task)

Files owned:
  Owns: /src/api/players.ts, /src/types/player.ts
  (the sub-agent will touch ONLY these files)

AC coverage:
  Satisfies: AC-001, AC-003

## Step 5 — Group Tasks into Waves

Organise all tasks into execution waves:

  Wave 1 — PARALLEL (no dependencies)
  Task 1 [PARALLEL] Agent: implementer  Owns: <files>  Satisfies: AC-001
  Task 2 [PARALLEL] Agent: implementer  Owns: <files>  Satisfies: AC-002
  Task 3 [PARALLEL] Agent: test-writer  Owns: <files>  Covers: TC-001, TC-002
  → code-reviewer runs after Wave 1 before Wave 2 starts

  Wave 2 — SEQUENTIAL
  Task 4 [SEQUENTIAL, DEPENDS ON: 1,2]  Agent: implementer  Owns: <files>
  → code-reviewer runs after Wave 2 before Wave 3 starts

  Wave 3 — PARALLEL
  Task 5 [PARALLEL]  Agent: implementer  Owns: <files>
  Task 6 [PARALLEL]  Agent: doc-updater  Owns: <doc files>
  → Final code-reviewer pass across all changes

## Step 6 — AC Coverage Check

Before saving the plan, verify every AC in requirements.md
has at least one task assigned to it. Flag any uncovered ACs.
No AC may be left without a task.

## Step 7 — Save the Plan

Save to /apps/<app>/docs/implementation-plan.md:

---
Doc version: v0.1 (increment if updating existing)
Last updated: YYYY-MM-DD
Status: IN PROGRESS
App version at last update: v0.x.x
---

Include a checkbox [ ] for every task so phase-execute can
tick them as sub-agents complete.

## Step 8 — Confirm

Present the wave structure as a summary table.
Do not begin execution until I confirm: SIGNED OFF.
