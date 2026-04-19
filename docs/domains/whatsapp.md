# WhatsApp

Family WhatsApp group bot — read-only financials queries + (queued) daily digest of actionable emails.

**Path ownership:** `src/app/api/whatsapp/*`, `src/lib/whatsapp/*`

## Shipped

- **v0.3.0** (2026-04-19) — v1 WhatsApp bot live. Three read-only commands: `spend`, `balance`, `recent`. HMAC-SHA256 signature verification. Idempotency via `whatsapp_processed_messages` table. Allowlist by E.164 phone number.
- **v0.3.1** (2026-04-19) — post-launch polish: timezone-aware `spend` range (uses shared `APP_TIMEZONE='Australia/Sydney'` constant in `src/lib/constants.ts`); diagnostic logs stripped from webhook.
- **v0.3.2** (2026-04-19) — WhatsApp home stat card on dashboard.
- **v0.4.0** (2026-04-20) — **Daily Gmail digest shipped.** Cron fires at `0 20 * * *` UTC (≈06-07 AM Sydney year-round). Sends each allowlisted recipient up to 20 actionable+unreviewed emails ranked by priority (age + deadline keywords + dollar amounts), with Gmail deep-links. Reply grammar: `task 1,3 / reject 2,4 / task 1-5 / task all / reject rest / done / help`. Replies resolve positions via `whatsapp_digest_snapshots` and call the shipped `confirmEmailAsTask`/`rejectEmail` helpers. Cross-domain with Scan + Tasks. New endpoint: `POST /api/cron/digest` (Bearer-auth with `CRON_SECRET`).
- **Live URL:** `https://family-action-hub.vercel.app/api/whatsapp/webhook`
- **Cron URL:** `https://family-action-hub.vercel.app/api/cron/digest` (requires `Authorization: Bearer $CRON_SECRET`)
- **Meta App ID:** `1249232917423303`; test number "from" is `+1 555 637 6549`
- **Allowlist:** Maged `+61412408587`, Mandy `+61402149544`

## In-flight

- None.

## Queued (next)

1. **Permanent access token via Meta System User** — current `WHATSAPP_ACCESS_TOKEN` is a 24h temporary token. Set up a System User in Meta Business Settings to get a permanent token. No code changes needed — just env var refresh.
3. **Add more family members to allowlist** — Meta test number caps at 5 registered recipients. When adding anyone, update both `WHATSAPP_ALLOWED_NUMBERS` env var AND Meta's recipient list.
4. **[Home stat card] WhatsApp bot visibility on home page** — NavCard showing "N messages processed, last: X min ago" pulled from `whatsapp_processed_messages`. ~30 min of work. Cross-domain with Home/Shell. Design decision already recorded: WhatsApp IS the primary UI; this card is for observability only, no click-through needed.
5. **[Admin UI] `/whatsapp` management page** — full page for: last N messages + replies log, allowlist view, env-var health ("token expires in 18h"), add/remove phone number without Vercel dashboard. Worth doing when there are 2+ more commands or when Mandy wants self-service. ~3-4 hr of work.

## Deferred

- **Write commands** (e.g. "mark task done") — v1 is read-only by design.
- **Multi-family-member identity routing** — v1 treats everyone the same, allowlisted by phone number. Adding identity-specific scoping deferred until a use case emerges.

## Gaps / rough edges

- **24-hour access-token expiry.** Current temp token expires daily until System User is set up (see "Queued" above).
- **Schema sync gap** (memory: `whatsapp_schema_sync_todo.md`) — `whatsapp_processed_messages` was created in live Neon via raw SQL. Verify it's now in sync with `src/lib/db/schema.ts` before any other schema change.

## Related memory

- `whatsapp_bot_resume.md` (state: SHIPPED), `whatsapp_schema_sync_todo.md`, `whatsapp_daily_digest_queued.md`
