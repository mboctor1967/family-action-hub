---
Feature: Digest age cap
Date: 2026-08-30
Tier: LOW
Status: SHIPPED
Target release: v0.5.0 (user chose minor over the recommended patch)
App version at last update: v0.5.0
---

# Digest age cap

## Goal

The daily WhatsApp digest selects every `emails_scanned` row where
`classification='actionable' AND triage_status='unreviewed'` with **no date bound**
(`src/app/api/cron/digest/route.ts:81-97`). Any email left untriaged therefore
reappears in every digest forever. After the 2026-08-30 outage recovery the digest
arrived carrying three genuine 2026-04-29/30 emails alongside the three new ones —
four-month-old items presented as today's news. Bound the digest to the same 7-day
window the scanner uses, so the digest and the scan agree on what "current" means.

## User stories

- US-001 — As the digest recipient, I want the morning digest to contain only
  recent actionable email, so that it reads as today's inbox and not a graveyard
  of everything I have ever failed to triage.

## Key decisions

**DEC-1 — Age cap = 7 days, measured on `emails_scanned.date`, evaluated at digest time.**
Chosen over 14d and 30d. The bug was the digest and the scanner disagreeing about
what "current" means; one shared window removes the class of problem rather than
lengthening it. `run-scan.ts:143-147` uses a rolling 7-day Gmail query, so a
7-day digest cap means the digest shows exactly the set the scanner can still see.
An item still gets seven consecutive morning nudges before it drops.

Implementation notes (not load-bearing, recorded so the next reader doesn't re-litigate):

- The bound is applied **in SQL** (`gte`), not in JS. `emails_scanned` grows without
  limit — 785 rows in April alone — so the filter belongs in the query.
- The cutoff is a named constant beside the digest query, not an env var.
- Dropped items are **not** auto-rejected. They stay `unreviewed` and remain visible
  in the triage UI; the cap governs the digest only.

## Acceptance criteria

- AC-001 [MUST] — **Given** an actionable, unreviewed email dated more than 7 days
  before the digest run, **When** the digest is built, **Then** that email is absent
  from the digest. — Risk: LOW
- AC-002 [MUST] — **Given** an actionable, unreviewed email dated within the last
  7 days, **When** the digest is built, **Then** that email is present in the digest. — Risk: LOW
- AC-003 [MUST] — **Given** an email excluded from the digest by the age cap,
  **When** the digest run completes, **Then** its `triage_status` is still
  `unreviewed` (the cap never mutates data). — Risk: LOW

## Out of scope

- Backfilling the 2026-05-04 → 2026-08-22 scan gap (decided: not worth it — see
  memory `scan_digest_window_gaps`).
- Making the scan window itself configurable beyond `24h`/`7d`/`30d`.
- Migrating `timestamp` columns to `timestamptz` (follow-up; see Cross-domain impact).
- Auto-rejecting or archiving items that age out of the digest.

## Assumptions

- ASSUMPTION-001 — `emails_scanned.date` is populated for every actionable row.
  Impact if wrong: rows with a NULL date would be silently dropped by a `gte`
  bound. Verified against production before implementation — see T-1.

## Implementation tasks

### Wave 1 — filter + tests

- [x] **T-1** (S) — Confirm no actionable row has a NULL `date` in production;
  if any exist, decide NULL handling before writing the query. · read-only check ·
  validates ASSUMPTION-001 — **PASS 2026-08-30:** 1,088 rows, 0 NULL dates
  (actionable 44 / informational 398 / noise 646). ASSUMPTION-001 holds.
- [x] **T-2** (S) — Add `DIGEST_MAX_AGE_DAYS = 7` and an exported pure
  `digestCutoff(now)` helper; bound the digest query with `gte(emailsScanned.date, cutoff)` ·
  owns `src/app/api/cron/digest/route.ts` · satisfies AC-001, AC-002, AC-003 ·
  test: TC-001, TC-002, TC-003

## Test cases

- TC-001 [AUTO] — covers AC-001, AC-002 — `src/app/api/cron/digest/__tests__/route.test.ts` —
  `digestCutoff` boundary: exactly 7 days old is included; 7 days + 1ms is excluded.
- TC-002 [AUTO] — covers AC-001 — same file — the digest query is issued with a
  date lower bound equal to the cutoff (assert on the captured `where` condition).
- TC-003 [MANUAL] — covers AC-003 — After the next digest, confirm the three
  rejected April rows stay `rejected` and no other row's `triage_status` changed.
  Expected: `SELECT triage_status, count(*) FROM emails_scanned GROUP BY 1` unchanged
  apart from any triage the user performed deliberately.
  **Baseline captured 2026-08-30 pre-deploy:** `(null)` 1044 · `confirmed` 10 ·
  `rejected` 31 · `unreviewed` 3. — PENDING (verify after the next digest run)

## Test results — 2026-08-30

| TC | Result | Evidence |
|---|---|---|
| TC-001 | PASS | `route.test.ts` — cutoff boundary, inclusive at exactly 7d, excluded at 7d+1ms |
| TC-002 | PASS | `route.test.ts` — captured `where` condition carries exactly one date param, ~7d before now |
| TC-003 | PENDING | manual, after the next digest; baseline recorded above |

Suite: **159 passed / 159** (22 files). `tsc --noEmit` clean. `npm run build` clean.
`eslint src/app/api/cron/digest/route.ts` clean; the test file's 17 `no-explicit-any`
errors are pre-existing on master and unchanged by this work.

Red-first was observed: both new tests failed before the implementation (TC-001 on
the missing export, TC-002 with zero date params in the query).

**Real-data effect measured pre-deploy:** old query 3 rows, new query 3 rows —
identical today only because the three stale April rows were triaged by hand during
the outage recovery. The cap is preventative, not corrective.

## Cross-domain impact

None for this change. **Follow-up logged:** `scan_runs.started_at` / `completed_at`
(and `schema.ts:489`) are `timestamp` without time zone, so the Neon driver reads
them as the *local* time of whichever machine queries — a 7-hour phantom shift on a
Pacific-time workstation, which is what made the cron schedule look wrong when it
was correct all along. Fixing that is a schema change across several tables and
belongs in its own brief.

## Release notes

### User-facing

Your morning digest now only shows email from the last 7 days. Previously it listed
every actionable email you had never triaged, with no date limit at all — which is
why the first digest after the outage recovery arrived carrying four-month-old items
next to the new ones. Anything older than a week drops off the digest but is **not**
deleted or dismissed: it stays unreviewed and visible in the triage screen. Seven
days matches the scanner's own lookback window, so the digest and the scan now
describe the same set of email.

Ops: `WHATSAPP_OPS_NUMBER` is now set explicitly in Vercel production rather than
relying on the first-allowlist-entry fallback.
