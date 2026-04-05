---
description: Slim release workflow for the lite track. Patch version bump, one-paragraph release note with QA test references, pre-commit gate, commit, and optional Vercel deploy. Run after /project:quick-feature. For significant releases use /project:release instead.
argument-hint: "<feature description> [--app <app-name>] [--minor]"
---

# Quick Release — $ARGUMENTS

## Step 1 — Version Bump

Read current version from package.json.
Recommend a bump level based on the change (lite track default = patch).

Present the options menu:

  Current version: v____
  Recommended: --patch → v____
  
  What bump would you like?
    [A] Patch — v____ (recommended for lite track / refactors / UI tweaks)
    [B] Minor — v____ (new user-facing feature)
    [C] Major — v____ (breaking change — unusual for lite track)
    [D] Skip version bump (not recommended — only for WIP or experimental work)

Wait for confirmation. Do not edit package.json until the user picks an option.

Once chosen, update package.json for the affected app.

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

## Step 4 — Commit / Push / Deploy Menu

Draft the commit message first:

  git commit -m "fix|feat(<app>): <description> [v<version>]"

Present the draft, the list of staged files, and this menu:

  What would you like me to do?
    [A] Stop here — I'll handle commit manually later (leave everything staged)
    [B] Commit only (local, no push, no tag)
    [C] Commit + tag v<version> (local, no push)
    [D] Commit + tag + push to origin (triggers Vercel auto-deploy if configured)
    [E] Commit + tag + push + verify Vercel deploy + record in docs/deployment.md
    [F] Custom — tell me exactly which steps to run

Wait for the user's choice. Do NOT run git commands until they pick.

For [E], after the push completes:
  - Confirm the Vercel deployment URL
  - Append to /docs/deployment.md deployment history:
    v<version> | YYYY-MM-DD | SUCCESS | <notes>
  - If any smoke check fails, flag it and stop — do not mark complete.

For [A] or [B], remind the user what still needs to happen before the
feature is considered shipped (push, tag, deploy) so nothing gets lost.
