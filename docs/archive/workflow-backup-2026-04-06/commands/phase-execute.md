---
description: Execute the implementation plan using orchestrated sub-agents. Reads the wave structure from implementation-plan.md, spawns parallel sub-agents per wave, runs code-reviewer after each wave, and updates the plan checkboxes as tasks complete. This is the core sub-agent orchestration command.
argument-hint: "<feature or app name> [--wave N to start from a specific wave]"
---

# Implementation Execution — Orchestrated Sub-Agents — $ARGUMENTS

## Step 1 — Read and Validate the Plan

Read /apps/<app>/docs/implementation-plan.md in full.

Check:
- Is the plan SIGNED OFF?
- Are there any incomplete tasks from a previous execution?
  If yes: resume from the first incomplete task, skip completed ones.
- What is the starting wave? (default: Wave 1, or --wave N if specified)

Read also:
- /docs/spec.md — sub-agents will need this context
- /docs/requirements.md — acceptance criteria that tests must cover
- /docs/design.md — UI and component decisions

Present the execution plan to me as:
  Starting from: Wave N
  Tasks to execute: X
  Estimated sub-agents to spawn: Y
  
Wait for my go-ahead before spawning anything.

## Step 2 — Execute Each Wave

For EACH wave in the plan, in order:

### Wave Execution Protocol

**A. Brief sub-agents**

For each task in this wave, spawn the assigned sub-agent with:
- The full task description from the plan
- The exact files it owns (and must not touch outside of)
- The relevant section of /docs/spec.md
- The acceptance criteria from /docs/requirements.md that this task covers
- The definition of done: tests passing, doc checkbox ticked

**TDD Discipline (non-negotiable for every task):**

Every task that involves writing code must follow RED-GREEN-REFACTOR:
1. Write the test FIRST
2. Run the test — WATCH IT FAIL (this proves the test actually tests something)
3. If the test passes before implementation: the test is wrong. Fix the test.
4. Write the minimal implementation
5. Run the test — confirm it passes
6. Refactor if needed, tests still pass

Rationalization traps (sub-agents must not fall for these):
- "This is too simple for a test" → Write the test. Simple code has simple tests.
- "I'll add tests after" → No. Test first or not at all.
- "The test would just duplicate the implementation" → Then the test is wrong. Test behavior, not code.
- "It's just a UI change" → Verify the build. Check the render.

**B. Dispatch parallel agents**

For [PARALLEL] tasks in the same wave: spawn all at once.
Background them if they are long-running (research, exploration).
Monitor with /tasks.

Example dispatch for Wave 1:
  → Spawning implementer sub-agent for Task 1 (owns: /src/api/players.ts)
  → Spawning implementer sub-agent for Task 2 (owns: /src/components/PlayerCard.tsx)
  → Spawning test-writer sub-agent for Task 3 (owns: /tests/players.test.ts)
  All three running in parallel...

**C. Wait for wave completion**

Wait for all agents in the wave to report back before continuing.
As each agent completes:
- Tick its checkbox in /docs/implementation-plan.md
- Log its output summary

**D. Run code-reviewer after EVERY wave**

After each wave completes, spawn a code-reviewer sub-agent to review
all files changed in that wave. Pass it:
- The list of changed files
- The relevant spec section
- The coding standards from CLAUDE.md

If code-reviewer returns FAIL:
  → Do not proceed to the next wave
  → Spawn implementer sub-agent to fix the specific issues
  → Re-run code-reviewer
  → Only proceed when PASS

If code-reviewer returns PASS:
  → Log PASS in the plan doc
  → Continue to next wave

## Step 3 — Post-Execution

After all waves complete:

1. Spawn doc-updater sub-agent to update:
   - /docs/architecture.md (if structure changed)
   - /docs/changelog.md (add this feature's entry)
   - /docs/deployment.md (if new env vars or migrations)

2. Run the test suite:
   - Automated tests: spawn test-writer to verify all [AUTO] tests pass
   - Report results to /docs/test-results.md

3. Final code-reviewer pass across all changed files.

4. Present completion summary:
   - Tasks completed: N/N
   - Test cases passing: N/N
   - Docs updated: <list>
   - Ready for: /project:phase-test-results OR /project:phase-deploy

## Step 4 — Prepare Commit

Draft a commit message in the format:
  feat(<scope>): <description>
  
  - <what was built>
  - <tests: N auto, N manual>
  
  Docs updated: requirements, spec, implementation-plan, architecture, changelog

Do not commit — present the message for my review first.

## Recovery

If a sub-agent fails or gets stuck:
1. Note which task failed in the plan doc with [BLOCKED: reason]
2. Continue with any remaining parallel tasks in the same wave that are unaffected
3. Flag the blockage to me with a suggested resolution
4. Do not abandon the entire wave because one task is blocked
