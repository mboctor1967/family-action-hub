---
Feature: Scan reliability — fail loud on Gmail scan failure
Date: 2026-08-29
Tier: HIGH (score 8)
Status: IN PROGRESS
Target release: v0.5.0
App version at last update: v0.4.1
---

# Scan reliability — fail loud on Gmail scan failure

## Goal

The nightly Gmail scan has been completely dead since **2026-05-02** — roughly four months — and nothing told anyone. The Google OAuth client secret was rotated away during the 2026-04-20 secrets cleanup, so every token refresh since has returned `401 invalid_client`. The scan dies about one second into each run, before a single email is fetched.

The credential is a five-minute fix. The reliability problem is that a *total, sustained outage was invisible*: the cron caught the error and carried on, the scan run was never marked failed, and the digest kept sending from four-month-old database state so it still looked alive. This has been "fixed" before by re-authenticating; it recurred and again went unnoticed, because the fix was the credential and nothing was watching the credential.

This feature makes the scan fail loudly and visibly: failures are recorded, surfaced in Settings, and pushed to the operator over WhatsApp — and a failed scan can no longer masquerade as a quiet inbox.

## Evidence (root cause, established 2026-08-29)

| Signal | Value |
|---|---|
| Direct refresh test against stored `refresh_token` | `401 invalid_client` — "The provided client secret is invalid." |
| Last **completed** `scan_runs` row | 2026-05-02 |
| Last `emails_scanned.created_at` | 2026-05-04 (988 rows total, lifetime) |
| `gmail_accounts.token_expiry` | 2026-04-27 — never advanced since |
| `scan_runs` lifetime tally | 159 `running` / 30 `completed` — zero `failed`, ever |
| Last 30 days | 30 runs fired, 0 completed, 30 stuck, 0 emails ingested |
| Vercel cron itself | Fires reliably every day ~03:01 UTC. Not at fault. |

Related memory: `google_secrets_rotation_todo.md` (POSTPONED 2026-04-20 — "rotate exposed GOCSPX-Gt…tqF, clean up disabled ****Ffpq"). The cleanup removed the secret the stored refresh token was bound to.

## User stories

- **US-001** — As the hub operator, I want a WhatsApp alert the morning a scan fails, so an outage lasts one day instead of four months.
- **US-002** — As the operator, I want Settings to show Gmail connection health and when the last *successful* scan ran, so I can confirm the pipeline is alive without querying the database.
- **US-003** — As the operator, I want a failed scan to suppress the digest rather than send an empty-looking one, so "no actionable emails" always means my inbox is genuinely clear.
- **US-004** — As the operator, I want scan failures recorded with their cause, so I can tell an expired credential from a transient API blip without reading logs.
- **US-005** — As a family member on the allowlist, I want to keep receiving a normal digest and never see infrastructure error messages I cannot act on.

## Key decisions

| ID | Decision | Chosen |
|---|---|---|
| DEC-1 | Where failures surface | DB + Settings + WhatsApp ops alert |
| DEC-2 | Digest behaviour when scan fails | Suppress digest, alert operator only |
| DEC-3 | AI classification parse failure | Fail the batch — never persist fabricated classifications |
| DEC-4 | Token error taxonomy | Store machine-readable code; separate ops-fix from user-reconnect |
| DEC-5 | Recovery-run capacity | `maxDuration=300` + raise classify concurrency |

### DEC-1: Where failures surface

Context: the outage was invisible because failure state was never written down anywhere durable.

- **Option A** — log to Vercel only. Pros: zero code. Cons: Hobby log retention is short; already proved insufficient (logs from this morning's run had aged out during investigation). Risk: HIGH — repeats the exact failure.
- **Option B** — DB record + Settings surface. Pros: durable, queryable. Cons: only works if someone opens Settings. Risk: MED — passive.
- **Option C** — DB record + Settings surface + push alert. Pros: durable *and* active; failure reaches the operator unprompted. Cons: needs an ops-recipient concept. Risk: LOW.
- **Chosen: C** — the defining property of this bug is that no one was told. Passive surfaces alone would not have caught it.

### DEC-2: Digest behaviour when the scan fails

Context: a failed scan currently still sends a normal digest built from stale DB state.

- **Option A** — send the digest to everyone with a "STALE" banner. Pros: nobody can miss it. Cons: puts infrastructure errors on the family thread, where Mandy cannot act on them. Risk: LOW.
- **Option B** — suppress the digest entirely, alert the operator only. Pros: an empty inbox is never confused with a broken scanner; ops noise stays off the family thread. Cons: on a failure day, family members receive nothing at all. Risk: LOW.
- **Chosen: B** — silence is a clearer signal than a wrong digest, and the alert covers the operator. Accepted cost: recipients get nothing on a failure day (see ASSUMPTION-002).

### DEC-3: AI classification parse failure

Context: `src/lib/ai/classify.ts:110` currently catches a JSON parse failure and returns every email in the batch as `informational, confidence 0`, which is then written to `emails_scanned` as though the model decided it.

- **Option A** — keep the safe default. Pros: the scan always completes. Cons: silently misclassifies genuinely actionable mail as ignorable and fabricates an AI decision in the database. Risk: HIGH — data integrity.
- **Option B** — fail the batch, mark the run failed, persist nothing for that batch. Pros: no fabricated data; the failure is visible; unscanned emails are retried on the next run because they never entered `emails_scanned`. Cons: one bad batch fails the whole run. Risk: LOW.
- **Chosen: B** — writing invented classifications is worse than not scanning. The 7-day scan window means a failed run self-heals on the next successful one.

### DEC-4: Token error taxonomy

Context: `invalid_client` and `invalid_grant` need completely different remedies, and today both produce the same opaque "please reconnect your Gmail account" string — which is actively misleading, since reconnecting does not fix `invalid_client`.

**Decision:** classify refresh failures into a stored code:

| Code | Cause | Remedy |
|---|---|---|
| `invalid_client` | OAuth secret rotated or deleted | Replace `GOOGLE_CLIENT_SECRET` — reconnecting will **not** help |
| `invalid_grant` | Refresh token revoked or expired | User reconnects Gmail in Settings |
| `transient` | 5xx / network | Retried; clears on the next run |
| `unknown` | Unrecognised | Surface raw message |

Alert text and Settings copy branch on this code.

### DEC-5: Recovery-run capacity

Context: after four months dead, the first successful run pulls up to 100 emails, producing 20 sequential Anthropic calls at `concurrency: 1`, inside a route with **no `maxDuration`**. This did not cause the outage, but it is aimed directly at the recovery run.

**Decision:** set `maxDuration = 300` on the digest route (matching `src/app/api/financials/invoices/scan/route.ts:18`) and raise classify concurrency from 1 to 3, keeping `batchSize` at 5. Not a queue/worker split — that solves a problem the evidence shows has never occurred (deferred, see Out of scope).

### Trivial decisions taken inline

- Ops recipient is a new `WHATSAPP_OPS_NUMBER` env var, falling back to the first entry of `WHATSAPP_ALLOWED_NUMBERS`. No hardcoded phone number.
- No new API endpoint — extend the existing `GET /api/settings/gmail-accounts` response.
- `gmail_accounts.last_scan_at` keeps its current meaning: **last successful** scan. The health UI labels it as such.
- Retry policy for transient Anthropic/Gmail errors: 3 attempts, exponential backoff 1s / 2s / 4s.

## Acceptance criteria

- **AC-001** [MUST] — **Given** a scan that throws at any stage, **When** the run ends, **Then** its `scan_runs` row has `status='failed'`, a non-null `completed_at`, and `error_message` set. — Risk: LOW
- **AC-002** [MUST] — **Given** a scan fails, **When** the error is recorded, **Then** `gmail_accounts.last_error`, `last_error_code` and `last_error_at` are set for that account. — Risk: LOW
- **AC-003** [MUST] — **Given** a scan succeeds, **When** it completes, **Then** the error fields are cleared and `last_scan_at` advances. — Risk: LOW
- **AC-004** [MUST] — **Given** a refresh returns `invalid_client`, **When** the error is classified, **Then** the stored code is `invalid_client` and the message states the OAuth secret must be replaced and that reconnecting will not help. — Risk: MED
- **AC-005** [MUST] — **Given** a refresh returns `invalid_grant`, **When** classified, **Then** the code is `invalid_grant` and the message directs the user to reconnect in Settings. — Risk: LOW
- **AC-006** [MUST] — **Given** an access token that Gmail rejects with 401, **When** a list/get call fails, **Then** the client performs exactly one reactive refresh-and-retry before surfacing the error. — Risk: MED
- **AC-007** [MUST] — **Given** an Anthropic response that fails `JSON.parse`, **When** the batch is processed, **Then** no `emails_scanned` rows are written for that batch and the run is marked failed. — Risk: MED
- **AC-008** [MUST] — **Given** a transient Anthropic error (429/5xx), **When** it occurs, **Then** the call is retried up to 3 times with backoff before the run fails. — Risk: MED
- **AC-009** [MUST] — **Given** every account's scan failed, **When** the digest cron runs, **Then** no digest is sent to any recipient. — Risk: LOW
- **AC-010** [MUST] — **Given** a scan failure, **When** the cron completes, **Then** exactly one ops alert is sent to `WHATSAPP_OPS_NUMBER` naming the error code, the failing account and the last successful scan date. — Risk: MED
- **AC-011** [MUST] — **Given** a scan failure, **When** alerts are sent, **Then** no allowlisted number other than the ops number receives any message. — Risk: LOW
- **AC-012** [MUST] — **Given** the operator opens Settings, **When** the Gmail card renders, **Then** it shows connection state (Healthy / Needs attention), last successful scan as a relative date, and the last error with its remedy when present. — Risk: LOW
- **AC-013** [SHOULD] — **Given** the digest route runs a full scan, **When** deployed, **Then** `maxDuration = 300` is exported and classify concurrency is 3. — Risk: LOW
- **AC-014** [SHOULD] — **Given** the 159 historical `running` rows, **When** the cleanup runs once, **Then** rows with `started_at` older than 6 hours and no `completed_at` are marked `failed` with `error_message='backfilled: abandoned run'`. — Risk: LOW
- **AC-015** [COULD] — **Given** the operator wants a health check, **When** they run `npm run scan:health`, **Then** account state, recent run history and ingest-per-day print to the console. — Risk: LOW

## Out of scope

- Decoupling the scan from the digest request (queue/worker split). Evidence shows the timeout has never fired; `maxDuration` + concurrency covers the recovery run. Revisit if a real timeout is ever observed.
- Rotating the Google OAuth secret itself — an operator action in Google Cloud Console, a prerequisite to verification, not a code change.
- Proactive credential expiry prediction (warning before a token lapses).
- Moving ephemeral `config/classification.json` to the database (separate known gap in `docs/domains/scan.md`).
- Alerting for any failure other than the Gmail scan.

## Assumptions

- **ASSUMPTION-001** — Production Vercel holds the same invalid `GOOGLE_CLIENT_SECRET` as `.env.local`. Not directly verified (Vercel CLI absent; runtime logs had already aged out). Inferred from production showing zero completed runs since 2026-05-02. Impact if wrong: production fails for a different reason, and the new `error_message` will name it on the first run after deploy.
- **ASSUMPTION-002** — A day with no digest is an acceptable signal to family members on a failure day. Impact if wrong: revisit DEC-2 and add a plain "digest unavailable today" notice.
- **ASSUMPTION-003** — `WHATSAPP_ACCESS_TOKEN` is still valid (permanent System User token, per the 2026-04-20 ops note), so the alert path itself works. Impact if wrong: the alert silently fails — mitigated by the Settings surface as the passive backstop.
- **ASSUMPTION-004** — One Gmail account exists today; the design still iterates accounts and aggregates per-account errors.

## Schema changes

Branch `schema/scan-health-fields`, merges before all others.

```typescript
// scan_runs — add
errorMessage: text('error_message'),

// gmail_accounts — add
lastError: text('last_error'),            // human-readable message
lastErrorCode: text('last_error_code'),   // invalid_client | invalid_grant | transient | unknown
lastErrorAt: timestamp('last_error_at'),
```

Applied with `npx drizzle-kit push` after loading `.env.local`. All columns nullable — no backfill required, no existing read path changes.

## API sketches

No new endpoints. One response extended:

```
GET /api/settings/gmail-accounts        (auth: session required — unchanged)
→ 200 [{
    id, email,
    lastScanAt,        // last SUCCESSFUL scan
    lastError,         // string | null
    lastErrorCode,     // 'invalid_client' | 'invalid_grant' | 'transient' | 'unknown' | null
    lastErrorAt        // ISO | null
  }]
Covers: AC-012
```

## Implementation tasks

### Wave 1 — `schema/scan-health-fields` (merges first)

- [x] **T-1** [S] — Add the three `gmail_accounts` columns and `scan_runs.error_message` to the schema; run `drizzle-kit push`; verify against live Neon · owns `src/lib/db/schema.ts` · satisfies AC-001, AC-002 · test: TC-001

### Wave 2 — `fix/scan/fail-loud` (Scan domain)

- [x] **T-2** [M] — Error taxonomy helper mapping an OAuth/Gmail error to `{ code, message, remedy }` · owns `src/lib/scan/scan-errors.ts` · satisfies AC-004, AC-005 · test: TC-002, TC-003
- [x] **T-3** [M] — `run-scan.ts`: wrap the body after run-insert in try/catch — on throw, mark `scan_runs` failed with `error_message`, write the `gmail_accounts` error fields, then rethrow; on success clear those fields · owns `src/lib/scan/run-scan.ts` · satisfies AC-001, AC-002, AC-003 · test: TC-004, TC-005, TC-006
- [x] **T-4** [M] — `gmail/client.ts`: reactive refresh-and-retry once on a 401 from a Gmail call; classify refresh failures via T-2 instead of the current opaque throw · owns `src/lib/gmail/client.ts` · satisfies AC-004, AC-005, AC-006 · test: TC-007, TC-008
- [x] **T-5** [M] — `classify.ts`: remove the fabricated-`informational` fallback (throw instead); add 3-attempt backoff around `anthropic.messages.create`; raise concurrency to 3 · owns `src/lib/ai/classify.ts` · satisfies AC-007, AC-008, AC-013 · test: TC-009, TC-010, TC-011
- [x] **T-6** [S] — One-off cleanup for the 159 abandoned `running` rows; promote the diagnostic to `scripts/scan-health.ts` with an `npm run scan:health` alias · owns `scripts/scan-health.ts`, `scripts/backfill-abandoned-runs.ts`, `package.json` · satisfies AC-014, AC-015 · test: TC-012

### Wave 3 — `feat/settings/gmail-health` (Settings domain)

- [ ] **T-7** [S] — Extend `GET /api/settings/gmail-accounts` with the health fields · owns `src/app/api/settings/gmail-accounts/route.ts` · satisfies AC-012 · test: TC-013
- [ ] **T-8** [M] — Gmail card shows a state badge, last successful scan (relative), and the error + remedy when present · owns `src/app/(dashboard)/settings/page.tsx` · satisfies AC-012 · test: TC-014

### Wave 4 — `fix/whatsapp/digest-fail-loud` (WhatsApp — separate worktree, port 3001)

- [ ] **T-9** [S] — `export const maxDuration = 300` on the digest route · owns `src/app/api/cron/digest/route.ts` · satisfies AC-013 · test: TC-015
- [ ] **T-10** [M] — Ops alert formatter + `WHATSAPP_OPS_NUMBER` resolution with allowlist fallback · owns `src/lib/whatsapp/ops-alert.ts` · satisfies AC-010, AC-011 · test: TC-016, TC-017
- [ ] **T-11** [M] — Digest route: when all accounts fail, suppress every digest send and emit exactly one ops alert · owns `src/app/api/cron/digest/route.ts` · satisfies AC-009, AC-010, AC-011 · test: TC-018, TC-019

## Test cases

- **TC-001** [MANUAL] — AC-001/002 — **PASS 2026-08-29** — applied via `scripts/apply-scan-health-fields.ts` (idempotent `ADD COLUMN IF NOT EXISTS`, chosen over `drizzle-kit push` to remove any chance of a destructive diff). All 4 columns confirmed present and nullable in Neon.
- **TC-002** [AUTO] **PASS** — AC-004 — an `invalid_client` OAuth error maps to code `invalid_client` with a "replace the secret" remedy — `src/lib/scan/__tests__/scan-errors.test.ts`
- **TC-003** [AUTO] **PASS** — AC-005 — `invalid_grant` maps to code `invalid_grant` with a "reconnect" remedy — same file
- **TC-004** [AUTO] **PASS** — AC-001 — a throwing scan marks its run `failed` with `error_message` — `src/lib/scan/__tests__/run-scan.test.ts`
- **TC-005** [AUTO] **PASS** — AC-002 — a throwing scan writes `last_error`, `last_error_code`, `last_error_at` — same file
- **TC-006** [AUTO] **PASS** — AC-003 — a successful scan clears the error fields and advances `last_scan_at` — same file
- **TC-007** [AUTO] **PASS** — AC-006 — a 401 on a Gmail call triggers exactly one refresh-and-retry — `src/lib/gmail/__tests__/client.test.ts`
- **TC-008** [AUTO] **PASS** — AC-006 — a second consecutive 401 surfaces the error rather than looping — same file
- **TC-009** [AUTO] **PASS** — AC-007 — unparseable AI output throws and writes zero `emails_scanned` rows — `src/lib/ai/__tests__/classify.test.ts`
- **TC-010** [AUTO] **PASS** — AC-008 — a 429 is retried 3× with backoff, then succeeds — same file
- **TC-011** [AUTO] **PASS** — AC-008 — three consecutive failures propagate the error — same file
- **TC-012** [MANUAL] — AC-014/015 — **PASS 2026-08-29** — backfill marked exactly 159 rows `failed` (tally now 159 failed / 30 completed); `npm run scan:health` renders account health, run history and ingest.
- **TC-013** [AUTO] — AC-012 — the accounts endpoint returns the health fields — `src/app/api/settings/__tests__/gmail-accounts.test.ts`
- **TC-014** [MANUAL] — AC-012 — Settings on localhost:3000 shows "Needs attention" plus the `invalid_client` remedy before the secret is fixed, and "Healthy" after.
- **TC-015** [MANUAL] — AC-013 — confirm `maxDuration` is exported and the recovery run completes inside it.
- **TC-016** [AUTO] — AC-010 — the alert body names the error code, account email and last successful scan date — `src/lib/whatsapp/__tests__/ops-alert.test.ts`
- **TC-017** [AUTO] — AC-010 — an unset `WHATSAPP_OPS_NUMBER` falls back to the first allowlist entry — same file
- **TC-018** [AUTO] — AC-009/011 — all-accounts-failed sends zero digests and exactly one alert, to the ops number only — `src/app/api/cron/digest/__tests__/route.test.ts`
- **TC-019** [AUTO] — AC-009 — a successful scan still sends digests to every allowlisted recipient (regression) — same file

## Wave 2 outcomes (2026-08-29)

Test suite grew from 94 to **135 passing** (41 new). `tsc --noEmit` clean. Lint clean on every source file added or modified (the 4 remaining `no-explicit-any` errors in `gmail/client.ts` are pre-existing, in `fetchSingleEmail`, and untouched).

Two deviations from the brief, both deliberate:

1. **A run that finds no new emails now counts as a success** and advances `last_scan_at`. Previously that path updated `scan_runs` but never the account, so a stretch of quiet days would let "last successful scan" go stale and look identical to a broken scanner. AC-003's intent required this.
2. **Health is not derived from `last_error_code` alone.** The first `scan:health` run reported the account `[HEALTHY]` despite 119 days without a successful scan — because no failure had ever been *recorded*, so the error columns were null. Health is now `no error code AND last success within 48h`. The same rule must be used by the Settings card in T-8.

Known limit: a throw *before* the `scan_runs` row is inserted (account row missing, or the insert itself failing) records nothing on the account. The digest route still counts it as a scan error, so it is not silent, but the account-level error fields stay unset.

## Cross-domain impact

Decomposed into four single-domain branches per `docs/domains/_README.md`, schema first. Wave 4 lands in the `family-action-hub-whatsapp` worktree (port 3001) on `feat/whatsapp-bot`. The shared touch-point is `src/lib/db/schema.ts`, isolated into Wave 1 so no feature branch carries a schema change. New env var `WHATSAPP_OPS_NUMBER` must be added to Vercel before Wave 4 deploys.

## Prerequisite — operator action (blocks verification, not implementation)

1. Google Cloud Console → Credentials → OAuth client → create a new client secret.
2. Update `GOOGLE_CLIENT_SECRET` in Vercel production **and** `.env.local`.
3. Reconnect Gmail in Settings to mint a fresh refresh token.
4. Confirm with `npm run scan:health` — `last_error` clears and a run reaches `completed`.

Implementation and unit tests do not depend on this. TC-012, TC-014 and TC-015 do.

## Release notes

### User-facing

- (filled at release)

### QA

- (filled at release)

### Technical

- (filled at release)
