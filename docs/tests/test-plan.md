---
title: Test Plan
version: 1.0
updated: 2026-04-05
status: active
---

# Test Plan — Boctor Family Hub

## Scope
This test plan covers the entire Family Hub app. Each feature has its own test cases in `docs/tests/test-cases/` tracked by ID (TC-nnn).

## Test types

### 1. Manual functional testing
- **When:** After every feature phase
- **How:** Click through the feature end-to-end, verify expected behaviour
- **Logged in:** `execution-log.md`

### 2. Build verification
- **When:** After every file change
- **How:** `npx next build`
- **Must pass:** Before any commit
- **Logged in:** Not individually (only failures)

### 3. Data integrity checks
- **When:** After schema changes or migrations
- **How:** Manual SQL queries verifying row counts, constraints, relations
- **Logged in:** `execution-log.md` under schema change entries

### 4. Visual regression
- **When:** After UI refactors (Phase 2)
- **How:** Manual screenshot comparison before/after
- **Logged in:** `execution-log.md` as "visual check"

## What we do NOT test (yet)
- Automated unit tests (no Jest/Vitest setup) — deferred to Phase 4
- Browser cross-compatibility (Chrome-only for now)
- Mobile responsive (manual spot checks only)
- Load/performance testing (no traffic yet)
- Security (relies on Next.js + Neon defaults; review before public launch)

## Test environments
- **Local dev:** `http://localhost:3000` — primary workspace
- **Production:** `https://family-action-hub.vercel.app` — verify after each deploy
- **Database:** Single Neon DB (dev + prod share the same DB for now — known risk)

## Test data
- Real bank statements in Google Drive folder `1vnCPmFtVo-6KDy98avkkAim6DDPrDbWM`
- Entities: Personal, D3, Trust, Babyccino (seeded)
- Accounts imported via file scan (CBA, WBC)
- ~1,955 transactions as of 2026-04-05

## Traceability conventions
- Each test case has an ID: **TC-nnn**
- Each TC references:
  - Requirement IDs (R-nnn) from `docs/requirements/`
  - Spec IDs (S-nnn) from `docs/specs/`
- Execution entries reference TC-nnn, date, pass/fail, notes

## Test case template
```markdown
---
id: TC-001
feature: Transfer Detection
requirement: R-042
spec: S-018
---

## TC-001: Detect transfer pair between two CBA accounts

**Preconditions:**
- At least 2 accounts exist under the same entity
- At least one matching debit/credit pair exists

**Steps:**
1. Navigate to /financials/transfers
2. Click "Detect Transfers"
3. Verify proposals appear
4. Select a high-confidence pair
5. Click "Confirm"

**Expected:**
- Both transactions tagged with matching `transfer_pair_id`
- Both get `category = 'TRANSFERS'`
- Excluded from spending dashboard on next load

**Last run:** (see execution-log.md)
```

## Review cadence
- Test plan reviewed at end of each phase
- New test cases added as features are built
- Execution log reviewed before any deploy
