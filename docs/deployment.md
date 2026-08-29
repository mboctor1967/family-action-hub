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
| `DIGEST_FALLBACK_USER_ID` | Owner for digest replies from users without a hub record. |
| `BLOB_READ_WRITE_TOKEN`, `GDRIVE_FINANCIALS_FOLDER_ID`, `NOTION_DEDUPE_TOKEN`, `FINANCIAL_PARSE_MODEL` | Per-domain. |

## Scheduled jobs

| Path | Schedule (`vercel.json`) | Notes |
|---|---|---|
| `/api/cron/digest` | `0 20 * * *` | **Discrepancy:** every recorded run actually starts ~03:01 UTC, not 20:00. Unexplained — worth investigating; it means the digest arrives early afternoon Sydney, not at breakfast as documented. |

## Health checks

```bash
npm run scan:health     # Gmail credential state, last successful scan, run history, ingest
```

Run this first whenever the digest looks wrong. An account is only `HEALTHY` with no recorded error **and** a successful scan within 48h.

## Rollback

1. `git revert <commit>` and push — Vercel redeploys automatically.
2. Schema changes to date are additive and nullable, so a code revert needs no migration rollback.

## Deploy history

### 2026-08-29 — v0.4.2 — Scan reliability: fail loud

Ships the four-branch stack `schema/scan-health-fields` → `fix/scan/fail-loud` → `feat/settings/gmail-health` → `fix/whatsapp/digest-fail-loud`. See `docs/features/2026-08-29-scan-reliability-fail-loud.md`.

- **Schema:** already applied to the shared Neon instance before deploy (idempotent `ADD COLUMN IF NOT EXISTS`). No post-deploy migration step.
- **New env var:** `WHATSAPP_OPS_NUMBER` — **not yet set in Vercel**; falls back to the first allowlist entry, so the deploy is safe without it.
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
