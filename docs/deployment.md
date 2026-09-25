# Deployment

Production is **Vercel** (`family-action-hub`, project `prj_scbrG7NZYplB9azAl9j7xqRghGsL`), deployed automatically on push to `master`. The database is **Neon Postgres** — note that `.env.local` and Vercel production point at the **same instance**, so a schema change applied locally is already live in production.

## Environment variables

Set in Vercel project settings. `.env.local` mirrors them for local development.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon. Shared between local and production. |
| `AUTH_SECRET`, `AUTH_URL` | NextAuth. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth. **Rotating the secret invalidates every stored Gmail refresh token** — see the 2026-05 outage below. |
| `ANTHROPIC_API_KEY` | Email classification. |
| `CRON_SECRET` | Bearer auth for `/api/cron/digest`. Vercel generates this. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Meta Cloud API. Permanent System User token since 2026-04-20. |
| `WHATSAPP_ALLOWED_NUMBERS` | Comma-separated E.164 allowlist. |
| `WHATSAPP_OPS_NUMBER` | **Added v0.4.2.** Recipient for scan-failure alerts. Optional — falls back to the first entry of `WHATSAPP_ALLOWED_NUMBERS`. |
| `WHATSAPP_TEMPLATE_DIGEST` | **Added v0.6.0.** Name of the approved daily-digest template (`family_hub_digest`). Unset → the old free-form digest, which Meta drops outside the 24 h window. |
| `WHATSAPP_TEMPLATE_OPS_ALERT` | **Added v0.6.0.** Name of the approved scan-failure template (`family_hub_scan_alert`). Unset → free-form alert (same caveat). |
| `WHATSAPP_TEMPLATE_LANG` | **Added v0.6.0.** Optional, default `en`. Must match the language the templates were approved in. |
| `DIGEST_FALLBACK_USER_ID` | Owner for digest replies from users without a hub record. |
| `BLOB_READ_WRITE_TOKEN`, `GDRIVE_FINANCIALS_FOLDER_ID`, `NOTION_DEDUPE_TOKEN`, `FINANCIAL_PARSE_MODEL` | Per-domain. |

## Scheduled jobs

| Path | Schedule (`vercel.json`) | Notes |
|---|---|---|
| `/api/cron/digest` | `0 20 * * *` | **Fires at 20:00 UTC exactly as configured** (resolved v0.5.0). Recorded runs *look* like ~03:01 UTC because `scan_runs.started_at` is `timestamp` **without** time zone, so the Neon driver renders it in the reading machine's local zone — a 7-hour phantom shift when read from a Pacific-time workstation. Migrating those columns to `timestamptz` is a logged follow-up. |

## Health checks

```bash
npm run scan:health     # Gmail credential state, last successful scan, run history, ingest
```

Run this first whenever the digest looks wrong. An account is only `HEALTHY` with no recorded error **and** a successful scan within 48h.

## Rollback

1. `git revert <commit>` and push — Vercel redeploys automatically.
2. Schema changes to date are additive and nullable, so a code revert needs no migration rollback.
3. v0.6.0 only: to fall back to free-form WhatsApp without a redeploy, remove `WHATSAPP_TEMPLATE_DIGEST` / `WHATSAPP_TEMPLATE_OPS_ALERT` in Vercel. `whatsapp_outbound_messages` can stay; nothing depends on it existing.
4. **Never `drizzle-kit push` against this database.** It is shared with boctor-financials, and `drizzle.config.ts` limits the hub to its own tables via `tablesFilter`.

## Deploy history

### 2026-09-25 — v0.6.0 — WhatsApp delivery reliability

- **Deployment:** `dpl_56JBCpvMqoxtCrQWRB2ADcbhv3mh`, commit `8ff3723` on `master`, tag `v0.6.0` (on `54b69ef`). READY and aliased to `family-action-hub.vercel.app`, region `iad1`.
- **Schema:** `whatsapp_outbound_messages` was applied before deploy with `scripts/apply-whatsapp-outbound-messages.ts`. Additive only.
- **Also shipped in this push:** S1 (`3f9e42d`, the `export_jobs.requested_by` code change; its DB half was applied 2026-08-31) and the `tablesFilter` in `drizzle.config.ts`.
- **Env vars:** none needed at deploy time. The template vars `WHATSAPP_TEMPLATE_DIGEST` and `WHATSAPP_TEMPLATE_OPS_ALERT` are to be set once Meta approves both templates (submitted 2026-09-25). Until then the digest stays on the free-form path.
- **Smoke tests, run against the alias before the Vercel bot check started challenging this workstation:**

| Check | Expected | Result |
|---|---|---|
| `/login`, `/privacy`, `/terms` | 200 | PASS |
| `/settings` signed out | 307 to login | PASS |
| `/api/cron/digest` without the secret | 401 | PASS |
| Webhook GET with a bad verify token | 403 | PASS |
| Webhook POST with a bad signature | 401 | PASS |
| `digest/send`, `delivery-health`, `backfill/estimate`, `connect-gmail` signed out | 401 | PASS (middleware; this does not prove the new routes exist) |
| Runtime errors in the first hour | none | PASS |

- **Caveat:** about 45 polling requests in 6 minutes from one IP tripped Vercel's automatic bot check (`X-Vercel-Mitigated: challenge`, Security Checkpoint 403) for that client. No project firewall or Attack Mode is configured. Browsers pass the check. Poll through the Vercel API rather than curling the site.
- **Pending:** TC-008 (Send digest now, once the templates are Active) and TC-012 (3 consecutive daily digests with no replies).

### 2026-08-31 — v0.5.0 — Digest age cap

Bounds the daily WhatsApp digest to the last 7 days on `emails_scanned.date`, the same window the scanner uses. See `docs/features/2026-08-30-digest-age-cap.md`.

- **Schema:** none. Code-only change plus docs.
- **New env vars:** none. (`WHATSAPP_OPS_NUMBER`, added in v0.4.2, was set in Vercel production on 2026-08-30.)
- **Behaviour change:** actionable, unreviewed email older than 7 days no longer appears in the digest. It is **not** mutated — it stays `unreviewed` and visible in triage. An item gets seven consecutive morning nudges before it drops out.
- **Cron discrepancy resolved:** the suspected 03:01 UTC firing was a `timestamp`-without-time-zone display artefact, not a scheduling fault. See Scheduled jobs above.

**Deploy result:** `dpl_C97Nj5vKgjUfJE3xCESCYrnqVqyH` — state READY, target production, commit `b98a491`, region `iad1`, built in 71s (2026-08-31T22:59:06Z → 23:00:17Z), aliased to `family-action-hub.vercel.app`. Tag `v0.5.0` pushed.

**Smoke tests**

| # | Test | Result |
|---|---|---|
| 1 | Site boots — `/login` renders | **PASS** — HTTP 200 |
| 2 | `/api/cron/digest` returns 401 without a bearer token | **PASS** — 401 `{"error":"unauthorized"}` |
| 3 | `/api/cron/digest` returns 401 with a wrong bearer token | **PASS** — HTTP 401 |
| 4 | `/` redirects unauthenticated traffic | **PASS** — HTTP 307 |
| 5 | `npm run scan:health` reports `[HEALTHY]` | **PASS** — `mboctor@gmail.com [HEALTHY]`, refresh token present, last successful scan within 24h |
| 6 | Scan still ingesting post-deploy | **PASS** — run `2026-09-01T03:02Z` completed, 42 emails, 1 actionable, 23s |

**Still open:** TC-003 (manual) — confirm after the next digest that rows aged out by the cap keep their `triage_status`. Pre-deploy baseline recorded in the brief: `(null)` 1044 · `confirmed` 10 · `rejected` 31 · `unreviewed` 3.


### 2026-08-29 — v0.4.2 — Scan reliability: fail loud

Ships the four-branch stack `schema/scan-health-fields` → `fix/scan/fail-loud` → `feat/settings/gmail-health` → `fix/whatsapp/digest-fail-loud`. See `docs/features/2026-08-29-scan-reliability-fail-loud.md`.

- **Schema:** already applied to the shared Neon instance before deploy (idempotent `ADD COLUMN IF NOT EXISTS`). No post-deploy migration step.
- **New env var:** `WHATSAPP_OPS_NUMBER` — **set in Vercel production 2026-08-30** (v0.5.0). Resolves to the same number as the previous first-allowlist-entry fallback; setting it explicitly removes the dependency on allowlist ordering.
- **Known unverified at deploy time:** TC-014 (Settings card renders *Needs attention* with the remedy) — the automated half of AC-012 passes, the visual half was not checked. TC-015 (`maxDuration` on a real recovery run) cannot be exercised until the OAuth secret is rotated.
- **Does not fix the outage.** The Gmail scan stays dead until the operator mints a new Google OAuth client secret, updates `GOOGLE_CLIENT_SECRET` in Vercel and `.env.local`, and reconnects Gmail in Settings. What changes is that the *next* failure is reported within a day.

**Deploy result:** `dpl_EWKztq7xEdozPGetJYLxKMSxw1VQ` — state READY, target production, commit `651d01f`, region `iad1`, aliased to `family-action-hub.vercel.app`. Tag `v0.4.2` pushed.

**Smoke tests**

| # | Test | Result |
|---|---|---|
| 1 | Site boots — `/login` renders | **PASS** — HTTP 200 |
| 2 | `/api/cron/digest` returns 401 without a bearer token | **PASS** — 401 `{"error":"unauthorized"}` |
| 3 | `/settings` Gmail card shows **Needs attention** + remedy + Reconnect *(TC-014)* | **NOT RUN** — requires a signed-in session |
| 4 | `npm run scan:health` reports `[NEEDS ATTENTION]` | **PASS** — run locally against the shared database |

**What happens on the next cron run (~03:01 UTC):** for the first time the scan failure will be reported rather than hidden. Expect a WhatsApp alert naming `invalid_client`, and **no digest**. That is the feature working as designed, not a new fault.

### Background — the 2026-05 → 2026-08 outage

The 2026-04-20 OAuth secrets cleanup deleted the client secret the stored Gmail refresh token was issued against. Every refresh returned `401 invalid_client` from 2026-05-02 onward. 159 nightly runs failed, none were recorded as failures, and the digest kept sending from stale data. Discovered 2026-08-29. **Lesson: rotating `GOOGLE_CLIENT_SECRET` requires re-consenting Gmail in Settings immediately afterwards, and the credential needs a health check watching it.**
