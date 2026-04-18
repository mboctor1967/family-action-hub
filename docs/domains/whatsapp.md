# WhatsApp

Family WhatsApp group bot — read-only financials queries via @mention + (queued) daily digest of actionable emails. **Not present in main worktree.**

**Path ownership:** lives in a **separate worktree** at `C:\Users\MagedBoctor\Claude\family-action-hub-whatsapp` on branch `feat/whatsapp-bot`.

## Shipped

- Nothing shipped to master or production yet. v1 code exists but has **0 commits**.

## In-flight

- **`feat/whatsapp-bot` branch — PAUSED 2026-04-15** (memory: `whatsapp_bot_resume.md`)
  - v1 scope: 3 read-only commands (`spend`, `balance`, `recent`) via @mention in family WhatsApp group; allowlist by phone number
  - State: 21/21 vitest tests passing, lint clean, zero tsc regressions
  - Blocking task: Task 9 of the original plan — Meta app setup + ngrok smoke test (user hasn't figured out the Meta test number yet)
  - Env vars pending in `.env.local`: `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ALLOWED_NUMBERS`
  - Schema sync gap: `whatsapp_processed_messages` table created via raw SQL, not `drizzle-kit push` — see `whatsapp_schema_sync_todo.md` for the 7-step re-sync checklist

## Queued (next)

1. **Resume v1 bot** — Meta app config + ngrok + manual smoke (Task 9 of paused plan), then release gate (Task 10). Version bump + CHANGELOG + commit + push + verify deploy.
2. **Schema re-sync** (memory: `whatsapp_schema_sync_todo.md`) — run the 7-step checklist so `schema.ts` matches live Neon. Must happen before any other schema migration in any domain.
3. **Daily actionable-email digest** (memory: `whatsapp_daily_digest_queued.md`) — **blocked on v1 shipping first**. Cron-triggered WhatsApp summary of unreviewed actionable emails with Gmail deep links. Cross-domain with Scan (digest generator) and WhatsApp (send path).

## Deferred

- Write commands (e.g. "mark task done") — explicitly v1 is read-only. Future consideration.
- Multi-family-member identity routing — v1 treats everyone the same, allowlisted by phone number.

## Gaps / rough edges

- Work sits in a separate worktree. Current policy: don't merge to main worktree / master until Meta smoke test passes.
- Daily digest feature idea is stale-safe — memory entry captures design questions to ask at spec time.

## Related memory

- `whatsapp_bot_resume.md`, `whatsapp_schema_sync_todo.md`, `whatsapp_daily_digest_queued.md`
