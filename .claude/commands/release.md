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
- /docs/implementation-plan.md (what was built)
- /docs/test-results.md (what was tested)
- /docs/changelog.md (last release)

Apply the versioning rules from CLAUDE.md:
  New user-facing feature     → --minor  (0.x.0)
  Bug fix, no new feature     → --patch  (0.0.x)
  Breaking API/schema change  → --major  (x.0.0)
  Refactor only               → --patch  (0.0.x)

Present the proposed version bump and rationale.
Wait for confirmation before proceeding.

Confirmed new version: v_____

## Step 2 — Bump Version in All the Right Places

Once version is confirmed:

Spawn a doc-updater sub-agent to update:
- package.json in each affected app (version field)
- Any other version files (version.ts, constants.ts, etc. — check the codebase)

Present the list of files updated and their new version values.

## Step 3 — Generate Three-Audience Release Notes

Read:
- /docs/test-results.md (Release Notes Tagging section)
- /docs/requirements.md (user stories and AC descriptions)
- /docs/test-cases.md (TC-XXX descriptions)
- /docs/spec.md (technical changes)
- /docs/deployment.md (env vars, migrations)

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

Add to the TOP of /docs/changelog.md:

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

If any item is NO: stop. Resolve it. Do not commit.

Present gate status with each item checked.
Wait for my confirmation before drafting the commit.

## Step 7 — Draft Git Commit

  git add .
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

Present the commit message and tag for my review.
Do not run git commands until I confirm.

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
