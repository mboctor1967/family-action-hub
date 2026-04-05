---
description: Tier 2 MEDIUM workflow. Streamlined 5-phase SDLC for self-contained features. Combined requirements and design session. Lightweight spec. Sub-agents for execution. Still gated before commit via /project:quick-release. Reached via /project:new-feature after tier sizing.
argument-hint: "<feature description> [--app <app-name>]"
---

# Tier 2 — Streamlined Feature — $ARGUMENTS

Tier 2 selected. Faster than full SDLC. Still disciplined.
Escalate to /project:new-feature-high if scope grows unexpectedly.
Drop to /project:hotfix if this turns out to be just a fix.

---

## Phase A — Requirements + Design (combined)

Spawn an explorer sub-agent to read:
- Any existing docs for this feature or similar features
- Current component structure of the affected app
- Existing patterns this feature should follow
- Cross-app impact check (shared models, APIs, components?)

In ONE session, elicit and document both requirements and design.

### What we're building
Goal: one paragraph describing the problem and who it's for.

User stories:
  US-001: As a <role>, I want <action> so that <benefit>.

### Key decisions (2–3 most important only)
For each significant decision, present options with recommendation:

  DECISION: <n>
  Option A: <description> — Recommended ✓ because <reason>
  Option B: <description> — Trade-off: <what you give up>
  Decision: [A] [B]

### Acceptance criteria
  AC-001 [MUST]: Given <state>, when <action>, then <outcome>
  AC-002 [SHOULD]: Given <state>, when <action>, then <outcome>

### Assumptions
  ASSUMPTION-001: <statement> — Impact if wrong: <brief>

### Out of scope
  - <explicit exclusion>

### Cross-app impact
  Affected apps: <list> | None identified

Save to /apps/<app>/docs/requirements.md:

  Doc version: v0.1
  Last updated: YYYY-MM-DD
  Status: SIGNED OFF
  App version at last update: v0.x.x
  Tier: 2 — Streamlined

Wait for my confirmation before continuing.

---

## Phase B — Spec (lightweight)

Cover only what is non-obvious or non-standard for this codebase:
- Technical decisions (with recommendation if a choice was made)
- New functions or endpoints: name, inputs, outputs, errors
- State shape if non-trivial
- Auth and validation rules
- Any schema changes (if none: state explicitly)

Save to /apps/<app>/docs/spec.md:

  Doc version: v0.1
  Last updated: YYYY-MM-DD
  Status: SIGNED OFF
  App version at last update: v0.x.x
  Tier: 2 — Streamlined

Wait for my confirmation before continuing.

---

## Phase C — Plan + Test Cases (combined)

Invoke Superpowers write-plan skill.

Annotate each task:
  [PARALLEL] | [SEQUENTIAL, DEPENDS ON: N]
  Agent: implementer | test-writer
  Owns: <file list>
  Satisfies: AC-XXX

Keep waves simple — usually Wave 1 parallel, Wave 2 cleanup only.

Include test cases inline below the plan (no separate test-plan.md):

  TC-001 [AUTO] — AC-001 — <test name>
  Given / When / Then (from AC)
  Test file: /tests/<file>.test.ts

  TC-002 [MANUAL] — AC-002 — <test name>
  Steps: <brief>
  Expected: <outcome>

Save to /apps/<app>/docs/implementation-plan.md:

  Doc version: v0.1
  Last updated: YYYY-MM-DD
  Status: SIGNED OFF
  App version at last update: v0.x.x
  Tier: 2 — Streamlined

Wait for my confirmation before executing.

---

## Phase D — Execute

Run /project:phase-execute $ARGUMENTS

Sub-agent orchestration still applies in full.
Code quality does not scale down with feature size.
Code-reviewer gates each wave before the next starts.

---

## Phase E — Release Gate (mandatory — nothing commits without this)

Run /project:quick-release $ARGUMENTS

Release notes are shorter but still cover all three audiences:
- User-facing: 1–3 bullet points
- QA: list of TC-XXX to verify, any regression areas
- Technical: what changed, any env var or migration notes

Pre-commit gate still applies in full.
Nothing commits without /project:quick-release completing.

---

## Completion Definition

Feature is complete when:
- [ ] Requirements + design doc written and confirmed
- [ ] Lightweight spec written and confirmed
- [ ] Implementation plan with inline test cases written and confirmed
- [ ] All tasks executed, code-reviewer PASS on all waves
- [ ] All AUTO tests passing, MANUAL tests executed
- [ ] /project:quick-release completed
- [ ] Git commit and tag created
- [ ] Vercel deployment confirmed (if applicable)
