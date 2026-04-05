---
description: The mandatory pre-commit release workflow. Determines version bump, writes three-audience release notes (user-facing, QA with TC references, technical), runs the pre-commit gate, then the pre-deploy gate before Vercel. Nothing gets committed or deployed without this completing.
argument-hint: "<app name> [--patch | --minor | --major] [--message 'release summary']"
---

# Release Workflow — $ARGUMENTS

This command is the gate between development and GitHub/Vercel.
Nothing commits. Nothing deploys. Until this is done.

## Step 1 — Determine Version Bump

Read the current version from package.json for the affected app(s).

If --patch, --minor, or --major was passed: use that.
If not passed, determine the correct bump by reading:
- The relevant plan in docs/plans/ (what was built)
- docs/tests/execution-log.md (what was tested)
- docs/CHANGELOG.md (last release)

Apply the versioning rules from CLAUDE.md:
  New user-facing feature     → --minor  (0.x.0)
  Bug fix, no new feature     → --patch  (0.0.x)
  Breaking API/schema change  → --major  (x.0.0)
  Refactor only               → --patch  (0.0.x)

Present the proposed version bump and rationale, then show the options menu:

  Current version: v____
  Recommended: --<level> → v____
  Rationale: <one line>
  
  What bump would you like?
    [A] Patch  — v____
    [B] Minor  — v____
    [C] Major  — v____
    [D] Skip version bump (WIP / experimental only — not recommended for full release)

Wait for the user's choice. Do not proceed until confirmed.

Confirmed new version: v_____

## Step 2 — Bump Version in All the Right Places

Once version is confirmed:

Spawn a doc-updater sub-agent to update:
- package.json in each affected app (version field)
- Any other version files (version.ts, constants.ts, etc. — check the codebase)

Present the list of files updated and their new version values.

## Step 3 — Generate Three-Audience Release Notes

Read:
- docs/tests/execution-log.md (test results)
- The relevant requirements in docs/requirements/ (user stories and AC descriptions)
- The relevant spec in docs/specs/ (technical changes)
- docs/CHANGELOG.md (previous entries for context)

Generate THREE separate sections for /docs/release-notes.md:

---
Doc version: v0.1 (increment per release)
Release date: YYYY-MM-DD
App version: v<new version>
Released by: <name or "Claude Code + Maged">
---

# Release Notes — v<new version>

---

## 📣 User-Facing Release Notes
(Plain language. No jargon. What can users do now that they couldn't before?)

### What's New
- <Feature description in plain language>
  - <Sub-point if needed>

### Improved
- <What works better>

### Fixed
- <What was broken that now works>

### Known Limitations
- <Anything the user should be aware of>

---

## 🧪 QA Release Notes
(For testers. References test cases. Tells them exactly what to verify.)

### What to Test in This Release

#### Feature: <n>
Test cases to run:
- TC-001 — <test name> — <what to check> — Priority: HIGH
- TC-002 — <test name> — <what to check> — Priority: MEDIUM

Expected results:
- <specific observable outcome>

Edge cases to check:
- <edge case from requirements edge cases section>

Known issues to watch for:
- <anything that was close to failing or had workarounds>

Regression areas (test these too — changes may have touched them):
- <existing feature that could be affected>

---

## ⚙️ Technical Release Notes
(For developers and DevOps. What changed under the hood.)

### Changes
- <technical change>

### New Environment Variables
| Variable     | Required | Description       | Default |
|--------------|----------|-------------------|---------|
| NEW_VAR      | yes      | <what it does>    | none    |

### Database Migrations
Run in order before deploying:
1. <migration file> — <what it does>

### API Changes
- POST /api/<endpoint> — NEW
- GET /api/<endpoint> — MODIFIED: <what changed>

### Breaking Changes
- <any breaking change — flag clearly>

### Dependencies Updated
- <package>: <old version> → <new version>

---

## Step 4 — Update Changelog

Add to the TOP of docs/CHANGELOG.md:

  ## v<new version> — YYYY-MM-DD

  ### Added
  - <item>

  ### Changed
  - <item>

  ### Fixed
  - <item>

  ### Technical
  - <item>

## Step 5 — Update All Doc Version Headers

Spawn a doc-updater sub-agent to update the
"App version at last update" field in every doc
that was modified in this release cycle.

## Step 6 — PRE-COMMIT GATE

Run through this checklist. Every item must be YES before committing.

  [ ] Version bumped in package.json — new version: v_____
  [ ] Release notes written — all three audiences
  [ ] Every item in user-facing notes linked to at least one AC
  [ ] Every item in QA notes references at least one TC-XXX
  [ ] Changelog updated
  [ ] All doc version headers updated
  [ ] All automated tests passing (confirm from test-results.md)
  [ ] No CRITICAL or HIGH defects open
  [ ] lint passing: <run lint command>
  [ ] type-check passing: <run tsc --noEmit>
  [ ] EVIDENCE RULE: Every claim above must show actual command output.
      "Tests pass" means show the test run. "Build succeeds" means show the build output.
      No assertions without evidence. If you didn't run it, you can't check it off.

If any item is NO: stop. Resolve it. Do not commit.

Present gate status with each item checked.
Wait for my confirmation before drafting the commit.

## Step 7 — Draft Git Commit + Commit Menu

Draft the commit message and tag first:

  git commit -m "feat(<app>): <description> v<version>

  <2-3 sentence summary of what was built>

  User-facing changes: <N items>
  QA test cases: TC-001, TC-002, TC-003
  Docs updated: requirements, spec, implementation-plan,
                test-plan, test-results, release-notes,
                changelog, deployment
  
  Fixes: <AC-XXX or issue refs>
  Version: v<new version>"

  git tag v<new version>

Present the drafted message, the list of staged files, and this menu:

  What would you like me to do?
    [A] Stop here — I'll handle commit manually later (leave everything staged)
    [B] Commit only (local, no push, no tag)
    [C] Commit + tag v<version> (local, no push)
    [D] Commit + tag + push to origin (stop before Vercel gate)
    [E] Commit + tag + push + run the PRE-DEPLOY GATE (Step 8)
    [F] Full pipeline — Commit + tag + push + deploy gate + Vercel deploy + smoke tests (Steps 8+9)
    [G] Custom — tell me exactly which steps to run

Wait for the user's choice. Do NOT run git commands until they pick.

For [A]/[B]/[C]/[D] the flow stops at that point. Remind the user what
still needs to happen (push, deploy gate, smoke tests) so nothing is
forgotten.

For [E] and [F], continue into Step 8 after the push completes.

## Step 8 — PRE-DEPLOY GATE (Vercel)

After commit is confirmed, before deploying to Vercel:

  [ ] Git commit made and pushed to correct branch
  [ ] Git tag created: v<version>
  [ ] All environment variables documented in deployment.md
  [ ] All new env vars added to Vercel project settings (confirm manually)
  [ ] Database migrations ready to run in the target environment
  [ ] Rollback procedure documented in deployment.md
  [ ] Smoke test list prepared (from deployment.md)

Present the deploy gate status.
Wait for my final confirmation before initiating Vercel deployment.

## Step 9 — Post-Deploy Smoke Tests

After Vercel deployment completes, run through the smoke test
checklist from /docs/deployment.md and confirm each item.

Record the deployment outcome in /docs/deployment.md:
  Deployed: YYYY-MM-DD HH:MM
  Environment: production | preview
  Status: SUCCESS | FAILED
  Smoke tests: PASSED | FAILED (list failures)
