---
description: Full 9-phase SDLC for Tier 1 HIGH complexity features. Full documentation lifecycle, structured options with recommendations, sub-agent wave orchestration, three-audience release notes, and mandatory pre-commit/pre-deploy gates. Reached via /project:new-feature after tier sizing.
argument-hint: "<feature description> [--app <app-name>]"
---

# Tier 1 — Full SDLC Lifecycle — $ARGUMENTS

Tier 1 selected. Full discipline applies.
Confirm with me at the end of each phase before proceeding.
Never skip ahead. Never start coding before Phase 3 is signed off.

---

## Before Starting

- Identify which domain(s) are affected and flag cross-domain impacts upfront
- Check if any relevant docs already exist — pick up from the right phase
- Confirm the starting phase with me

---

## Phase 1 — Requirements
/project:phase-requirements $ARGUMENTS

Structured options with recommendations. MoSCoW priorities.
Given/When/Then acceptance criteria. Assumption validation.
Cross-app impact check. Edge case prompting.
→ Wait for SIGNED OFF

## Phase 2 — Design & UI
/project:phase-design $ARGUMENTS

ADR-style design decisions with options and recommendation.
Every significant decision captured with rationale.
→ Wait for SIGNED OFF

## Phase 3 — Technical Spec
/project:phase-spec $ARGUMENTS

Technical decisions with options. Full API contracts.
Data models. Error handling. Security and performance notes.
→ Wait for SIGNED OFF

## Phase 4 — Implementation Planning
/project:phase-plan $ARGUMENTS

Generate implementation plan. Wave annotations for sub-agent execution.
Every task has AC coverage, agent assignment, and owned files.
→ Wait for SIGNED OFF

## Phase 5 — Test Planning
/project:phase-test-plan $ARGUMENTS

Full AC traceability matrix. AUTO and MANUAL test cases.
Every AC-XXX maps to at least one TC-XXX.
Can run concurrently with Phase 4 review.
→ Wait for SIGNED OFF

## Phase 6 — Implementation
/project:phase-execute $ARGUMENTS

Parallel sub-agents per wave. Code-reviewer gates each wave.
Doc-updater runs alongside reviewer after each wave.
Monitor with /tasks.

## Phase 7 — Test Execution
/project:phase-test-results $ARGUMENTS

Automated tests via sub-agent. Manual tests listed for me.
Release notes tagging populated here.
→ Wait for deployment gate: PASS

## Phase 8 — Deployment Documentation
/project:phase-deploy $ARGUMENTS

Env vars. Migrations. Smoke tests. Rollback procedure.
→ Wait for my confirmation

## Phase 9 — Release Gate (mandatory — nothing commits without this)
/project:release $ARGUMENTS

Version bump (MINOR for new features). Three-audience release notes.
Pre-commit gate. Git commit + tag. Pre-deploy gate.
Vercel deploy. Smoke tests. Deployment history updated.

---

## Completion Definition

Feature is complete when ALL of these are true:
- [ ] All phase docs written, versioned, and SIGNED OFF
- [ ] All AC-XXX have passing tests
- [ ] Three-audience release notes written and reviewed
- [ ] Version bumped in package.json (MINOR bump)
- [ ] Pre-commit gate passed
- [ ] Git commit and tag created
- [ ] Pre-deploy gate passed
- [ ] Vercel deployment confirmed
- [ ] Smoke tests passed
- [ ] Deployment history updated in deployment.md
