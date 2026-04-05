---
description: Create or update the Test Plan and Test Cases. Reads requirements (Given/When/Then ACs) and spec to produce full test coverage with direct AC traceability. Tags every test case AUTO or MANUAL. Includes edge case coverage from requirements.
argument-hint: "<feature or app name>"
---

# Test Planning Phase — $ARGUMENTS

## Step 1 — Read Upstream Docs

Spawn two explorer sub-agents in parallel:

Explorer A — read:
- /docs/requirements.md (all AC-XXX in Given/When/Then format)
- /docs/spec.md (API contracts, error handling, edge cases)
- /docs/design.md (UI states, empty states, error states)

Explorer B — read existing tests:
- Existing test files related to this feature
- Existing test-plan.md or test-cases.md
- Current test framework and conventions

## Step 2 — Assess Existing Coverage

If test files already exist:
- Map which ACs are already covered by existing tests
- Identify gaps
- Note any tests out of date with the current spec

## Step 3 — Write / Update Test Plan

Write or update /apps/<app>/docs/test-plan.md:

---
Doc version: v0.1 (increment if updating existing)
Last updated: YYYY-MM-DD
Status: DRAFT
App version at last update: v0.x.x
---

# Test Plan — <feature name>

## Test Strategy

Automated Testing:
- Unit: <what gets unit tested>
- Integration: <what gets integration tested>
- E2E: <critical user journeys>
- Framework: <jest | vitest | playwright | cypress>

Manual Testing:
- Visual/UX checks automation cannot cover
- Cross-browser or device-specific checks
- Exploratory testing scope

## AC Traceability Matrix
Every AC must appear in this table. No exceptions.

| AC ID  | AC Summary            | TC ID(s)        | Type        | Status   |
|--------|-----------------------|-----------------|-------------|----------|
| AC-001 | <short description>   | TC-001, TC-002  | AUTO/unit   | TODO     |
| AC-002 | <short description>   | TC-003          | MANUAL      | TODO     |

## Test Data Requirements
- Seed data needed
- External service mocks or stubs needed
- Environment-specific config

## Entry Criteria
- [ ] Implementation plan execution complete
- [ ] All automated tests written
- [ ] Test environment available

## Exit Criteria (deployment gate)
- [ ] All [AUTO] tests passing
- [ ] All [MANUAL] tests executed with result recorded
- [ ] No CRITICAL or HIGH defects open
- [ ] Release notes reference all relevant TC-XXX IDs

## Step 4 — Write / Update Test Cases

Write or update /apps/<app>/docs/test-cases.md:

---
Doc version: v0.1 (increment if updating existing)
Last updated: YYYY-MM-DD
App version at last update: v0.x.x
---

For EVERY AC, generate test cases:

  TC-001 — <test name>
  Type: [AUTO] | [MANUAL]
  AC: AC-001
  Priority: HIGH | MEDIUM | LOW

  Preconditions:
  - <what must be true before this test>

  Test steps (derived from Given/When/Then):
    Given: <precondition from AC>
    When: <action from AC>
    Then: <expected outcome from AC>

  Additional steps for edge cases:
  1. <step>
  2. <step>

  Expected result: <specific, observable outcome>
  Automated test location: /tests/<file>.test.ts (AUTO tests only)

Generate test cases for:
- Every AC happy path
- Edge cases flagged in requirements.md
- Error states from spec.md error handling section
- UI states: loading, empty, error, success

## Step 5 — Confirm

Present:
- N test cases (N AUTO, N MANUAL)
- N ACs with full coverage
- N ACs with partial coverage (flag these)
- N ACs with no coverage (flag these — block sign-off until resolved)

Do not proceed to Phase 6 until I confirm: SIGNED OFF.
When signed off, update Status and increment doc version.
