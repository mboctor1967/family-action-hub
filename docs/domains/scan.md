# Scan (Gmail)

Gmail inbox scanning + AI classification (actionable / informational / noise) + triage flow that promotes actionable emails into tasks.

**Path ownership:** `src/app/(dashboard)/scan/*`, `src/app/api/scan/*`, `src/lib/scan/*`

## Shipped

- Pages: `/scan` (scan controls + triage list)
- APIs: `POST /api/scan` (SSE stream), `GET/POST /api/scan/triage`, `POST /api/scan/triage/batch`, `POST /api/cron/digest` (v0.4.0)
- Helpers: `src/lib/scan/triage-actions.ts` (`confirmEmailAsTask`, `rejectEmail` — shared between single, batch, and WhatsApp-reply routes)
- **v0.4.0** (2026-04-20) — `runScanForAccount()` extracted from the SSE route (`src/lib/scan/run-scan.ts`) so the cron can invoke fresh scans; `src/lib/scan/priority-score.ts` ranks actionable emails for the digest.

## In-flight

- **`feat/triage-simplification` branch** — simplified triage UI: one checkbox per row + one commit button → batch endpoint → redirect to `/tasks?new=<ids>`. 6/6 vitest tests passing. Smoke test passed. Ready for T9 release gate. **Known limit:** neon-http driver doesn't support transactions, so AC6 (atomic rollback) is sequential-best-effort instead of transactional.

## Queued (next)

1. **Ship the triage simplification merge** — needs version bump + CHANGELOG + deploy (see `tasks.md` — this merge is cross-domain, grandfathered).
2. **Scan status banner on home** — home has no indicator when a scan is running in the background.
3. **Scheduled scan cron (user-facing)** — currently only the digest cron runs nightly (20:00 UTC). A separate user-triggered scheduled scan could fire at different intervals.

## Deferred

- **Transactional batch triage** — blocked by neon-http driver limitation. Would require switching to the pooled neon driver for these routes, out of scope until it causes a real bug.

## Gaps / rough edges

- Scan page is one monolithic file — no `src/components/scan/` directory. Extract when adding the next meaningful feature (e.g. digest config).
- Memory: `feedback_scan_debug_messages.md` captures user-requested UI behavior around scan progress.
- Classification config writes (`config/classification.json`) live inside the serverless function's filesystem — on Vercel these won't persist across deploys. Learned rules are currently ephemeral in production. Needs fix before scan becomes high-value (move to DB table).

## Related memory

- `feedback_scan_debug_messages.md`, `whatsapp_daily_digest_queued.md`
