---
description: Slim release workflow for the lite track. Patch version bump, one-paragraph release note with QA test references, pre-commit gate, commit, and optional Vercel deploy. Run after /project:quick-feature. For significant releases use /project:release instead.
argument-hint: "<feature description> [--app <app-name>] [--minor]"
---

# Quick Release — $ARGUMENTS

## Step 1 — Version Bump

Read current version from package.json.
Apply --patch bump by default (lite track = patch).
If --minor was passed: apply minor bump.

Proposed version: v_____
Confirm before proceeding.

Update package.json for the affected app.

---

## Step 2 — Write Release Note

Add to the TOP of /docs/release-notes.md (or /apps/<app>/docs/release-notes.md):

---
Release: v<new version> — YYYY-MM-DD
Track: LITE
---

### v<new version> — <date>

**What changed:** <one clear sentence in plain language>

**Details:** <2-3 sentences if needed — what users or developers notice>

**Tests covering this change:** TC-XXX | inline test: <test name>

**Deployment notes:** <env var changes or "none">

---

Also add a one-liner to /docs/changelog.md at the top:
  v<version> (YYYY-MM-DD) — <short description> [PATCH]

---

## Step 3 — Pre-Commit Gate

  [ ] Version bumped in package.json: v_____
  [ ] Release note written (plain language + test reference)
  [ ] Changelog updated
  [ ] All tests passing
  [ ] lint passing
  [ ] type-check passing
  [ ] No CRITICAL issues open

If any item is NO: stop and fix.

Present gate status. Wait for my confirmation.

---

## Step 4 — Commit

  git add .
  git commit -m "fix|feat(<app>): <description> [v<version>]"
  git tag v<version>

Present the command. Wait for my confirmation before running.

---

## Step 5 — Deploy (if applicable)

If this app deploys to Vercel automatically on push: confirm the
push triggered a deployment and note the deployment URL.

If manual deploy needed: list the steps.

Record in /docs/deployment.md deployment history:
  v<version> | YYYY-MM-DD | SUCCESS | <notes>
