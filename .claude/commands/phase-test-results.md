---
description: Execute tests and record results. Runs automated tests via sub-agent, lists manual tests for human execution, updates test-results.md, and flags which test cases should appear in release notes. Determines deployment gate status.
argument-hint: "<feature or app name>"
---

# Test Execution Phase — $ARGUMENTS

## Step 1 — Validate Preconditions

Read:
- /docs/test-plan.md (entry criteria — all must be met)
- /docs/test-cases.md (full test case list)
- /docs/implementation-plan.md (confirm all tasks ticked complete)

If any implementation tasks are still open: stop and flag.
If entry criteria not met: stop and flag.

## Step 2 — Run Automated Tests

Spawn a test-writer sub-agent to:
1. Run the automated test suite for this feature
2. Capture PASS / FAIL per TC-XXX test case ID
3. Capture error output for failing tests
4. Report back with structured results

Commands (adjust to project test runner):
  npm test -- --testPathPattern=<feature>
  npx vitest run <feature>
  npx playwright test <spec>

## Step 3 — Record Results

Write or update /apps/<app>/docs/test-results.md:

---
Doc version: v0.1 (increment per test run)
Run date: YYYY-MM-DD
Environment: dev | staging
App version tested: v0.x.x
Status: IN PROGRESS | COMPLETE
---

# Test Results — <feature name>

## Automated Test Results
| TC ID  | Test Name           | AC    | Result | Notes             |
|--------|---------------------|-------|--------|-------------------|
| TC-001 | <n>              | AC-001| PASS   |                   |
| TC-002 | <n>              | AC-002| FAIL   | <error summary>   |

Summary: N passed / N failed / N skipped
Coverage: N%

## Manual Test Results
List every [MANUAL] test case as a checklist for me to execute:

  TC-005 — <n>
  AC: AC-004
  Given: <precondition>
  When: <what to do>
  Then: <what to look for>
  Result: [ ] PASS  [ ] FAIL  [ ] BLOCKED
  Notes: ___________

Wait for manual test results before updating this section.

## Defects Found
| DEF-001 | Severity: CRITICAL|HIGH|MEDIUM|LOW | <description> | Status: OPEN |

## Release Notes Tagging
For each passing test case, note whether it should appear in release notes:

| TC ID  | AC    | Release notes item         | Audience          |
|--------|-------|---------------------------|-------------------|
| TC-001 | AC-001| <user-facing description>  | USER | QA | BOTH  |

This feeds directly into /project:release.

## Deployment Gate Decision

Based on exit criteria in test-plan.md:

  PASS     — all exit criteria met → proceed to /project:release
  FAIL     — blocking defects open → do not proceed
  CONDITIONAL — minor issues → list them, get my sign-off

Present the gate verdict clearly and wait for my confirmation
before proceeding to the release phase.
