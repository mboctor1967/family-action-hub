---
description: Minimal workflow for bug fixes, UI tweaks, and patch-level changes. No new docs required — just a fix description, one test proving the fix, patch version bump, and single-entry release notes before committing. Use only when fixing a known bug with 1–2 file changes and no new behaviour.
argument-hint: "<bug description or issue reference>"
---

# Hotfix — $ARGUMENTS

Tier 3 workflow. Minimal process. Maximum speed.
If this introduces new behaviour or touches more than 2 files:
stop and use /project:quick-feature instead.

## Step 1 — Understand the Bug

Spawn an explorer sub-agent to:
- Find the failing code
- Find the test that should have caught this (if any)
- Confirm this is genuinely a fix, not a new feature

Report back:
- Root cause: <what is wrong and why>
- Files to change: <list — should be 1 or 2>
- Test gap: <why wasn't this caught before>

## Step 2 — Fix with TDD

Follow /project:debug methodology for root cause tracing, then:
1. Write a test that fails because of this bug
2. Run it — WATCH IT FAIL (proves the test catches the bug)
3. If the test passes before the fix: the test is wrong. Fix the test.
4. Fix the bug (the root cause, not the symptom)
5. Run the test — confirm it passes
6. Run the full test suite — confirm nothing regressed (show output)

Do NOT:
- Add a null check to hide the real problem
- Add a try/catch to swallow the error
- "Fix" it without understanding why it broke

## Step 3 — Update the Relevant Doc (only if needed)

If this fix changes an acceptance criterion:
- Update the relevant AC in requirements.md
- Update the test case in test-cases.md

If nothing changes in the spec or requirements: no doc update needed.

## Step 4 — Release Gate (always required)

Run /project:release $ARGUMENTS --patch

For a hotfix, release notes are minimal:

User-facing:
- Fixed: <one line describing what the user experienced vs now>

QA:
- TC-XXX — verify <what to check> — file: <test file>
- Regression: run full suite

Technical:
- Files changed: <list>
- Root cause: <brief>
- Test added: <test name>

Pre-commit gate still applies:
- [ ] Patch version bumped in package.json
- [ ] Test added and passing
- [ ] Full test suite passing
- [ ] lint and type-check passing

Nothing commits without /project:release completing.
Not even hotfixes.
