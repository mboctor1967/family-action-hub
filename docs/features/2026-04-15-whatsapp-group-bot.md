# WhatsApp Group Bot — Financials Read-Only (v1)

**Date:** 2026-04-15
**Status:** Design — awaiting user review
**Tier:** MED (scored below)

## Sizing

| Factor | Score |
|---|---|
| Schema changes (1 new table: `whatsapp_processed_messages`) | +2 |
| New API endpoints (1: `/api/whatsapp/webhook`) | +2 |
| Cross-domain impact (reads financials only, no writes) | 0 |
| Files touched ~6–8 | +2 |
| New UI components | 0 |
| New user behaviour (WhatsApp → hub) | +1 |
| ACs expected 3–4 | +1 |
| **Total** | **8 → HIGH** (but UI-less + bounded; treat as MED) |

Treating as **MED** — no UI surface, all logic server-side with clear boundaries.

## Goal

Let Maged query his own hub financials from the family WhatsApp group by @mentioning the bot with one of three commands: `spend`, `balance`, `recent`.

## User stories

- As Maged, I @mention the bot in the family group with `spend` and get this month's total + top 3 categories inline in the group chat.
- As Maged, I @mention the bot with `balance` and see latest balance per account.
- As Maged, I @mention the bot with `recent` and see the last 5 transactions.
- As a non-allowlisted group member, if I @mention the bot, nothing happens (silent).

## Key decisions (inline ADRs)

### ADR-1 — Meta WhatsApp Cloud API, test number for v1
- **Chosen:** Meta Cloud API with the free Meta-provided test number. Up to 5 pre-registered recipients. Migrate to a verified business number later with no code changes (just env vars).
- **Why:** No business verification delay; free; sufficient for a family group ≤5 people.
- **Trade-off:** Test number can't scale beyond 5 recipients and is clearly a Meta sandbox number — fine for personal use, not for customers.

### ADR-2 — Allowlist by phone number via env var
- **Chosen:** `WHATSAPP_ALLOWED_NUMBERS` env var, comma-separated E.164 (e.g. `+61400123456,+61400999888`). Non-allowlisted senders get no reply (silent drop).
- **Why:** Simplest possible auth. No DB changes. Financials are Maged's data; keeping the allowlist tight is the right default.
- **Alternative rejected:** Mapping WhatsApp numbers to `users` table — unnecessary until commands become multi-user.

### ADR-3 — @mention required; no passive group listening
- **Chosen:** Bot only reacts when the business number is @mentioned or its message is replied to. This is a Meta Cloud API constraint, not a choice, but we codify the UX around it.
- **Why:** Meta Cloud API does not deliver arbitrary group messages to the webhook.

### ADR-4 — HMAC-SHA256 signature verification, raw body
- **Chosen:** Verify `X-Hub-Signature-256` against `WHATSAPP_APP_SECRET` using constant-time compare. Read raw request body via `await req.text()` in Next.js App Router, then `JSON.parse`.
- **Why:** Without signature verification, anyone on the internet can POST fake messages and exfiltrate financial data via the bot's replies. Non-negotiable.

### ADR-5 — Idempotency via processed-message table
- **Chosen:** New table `whatsapp_processed_messages(id TEXT PRIMARY KEY, received_at TIMESTAMPTZ DEFAULT NOW())`. Skip any inbound `message.id` already present.
- **Why:** Meta retries webhooks on non-200 or timeout. Without dedupe, a single user message can trigger multiple replies. No TTL cleanup for v1 (low volume).

### ADR-6 — Ack-fast, reply separately
- **Chosen:** Return 200 immediately after signature + idempotency check; dispatch reply via a second Graph API call. No queue for v1 — the Next.js route handler awaits the reply call but Meta gets its 200 before that. If reply fails, we log and move on.
- **Why:** Meta's timeout is 20s; we must ack within that window regardless of DB latency.

## Acceptance criteria (MoSCoW)

| ID | Must/Should | Given / When / Then |
|---|---|---|
| AC-1 | Must | **Given** Meta sends a GET verify challenge with correct token, **when** the route receives it, **then** it returns the challenge as plain text 200. Wrong token → 403. |
| AC-2 | Must | **Given** a POST with valid HMAC from an allowlisted sender containing `@bot spend`, **when** processed, **then** the bot replies in the group with formatted month spend + top 3 categories. |
| AC-3 | Must | **Given** a POST with valid HMAC and command `balance`, **when** processed, **then** the bot replies with latest balance per account. |
| AC-4 | Must | **Given** a POST with valid HMAC and command `recent`, **when** processed, **then** the bot replies with the last 5 transactions. |
| AC-5 | Must | **Given** a POST with invalid or missing HMAC, **when** processed, **then** the route returns 401 and sends no reply. |
| AC-6 | Must | **Given** a POST from a non-allowlisted sender, **when** processed, **then** the route returns 200 and sends no reply (silent). |
| AC-7 | Must | **Given** the same Meta `message.id` delivered twice, **when** processed, **then** the bot replies exactly once. |
| AC-8 | Must | **Given** a command the bot does not recognise, **when** processed, **then** the bot replies `Unknown command. Try: spend, balance, recent`. |
| AC-9 | Should | **Given** a message prefixed with `@FamilyBot`, **when** parsed, **then** the @mention tokens are stripped before command routing. |

## Schema

```sql
CREATE TABLE whatsapp_processed_messages (
  id TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Drizzle table in `src/lib/db/schema.ts`.

## API

**`GET /api/whatsapp/webhook`** — Meta verification handshake
- Query: `hub.mode`, `hub.verify_token`, `hub.challenge`
- 200 text `hub.challenge` if `hub.verify_token === WHATSAPP_VERIFY_TOKEN` else 403.

**`POST /api/whatsapp/webhook`** — inbound message
- Header: `X-Hub-Signature-256: sha256=<hmac>`
- Body: Meta webhook JSON envelope.
- Flow:
  1. Read raw body.
  2. Verify HMAC-SHA256 against `WHATSAPP_APP_SECRET` (constant-time). Fail → 401.
  3. Parse JSON. Extract `entry[0].changes[0].value.messages[0]`. If no message → 200 (status update event).
  4. Check idempotency table for `message.id`. Seen → 200.
  5. Insert `message.id` into table.
  6. Check `from` against `WHATSAPP_ALLOWED_NUMBERS`. Miss → 200 silent.
  7. If `type !== 'text'` → 200 silent.
  8. Strip leading `@<name>` tokens from `text.body`, lowercase, take first word → command.
  9. Route: `spend` | `balance` | `recent` | fallback → reply string.
  10. POST reply to Graph API with `context.message_id` to thread back to original message.
  11. Return 200.

## Files

| Path | Purpose |
|---|---|
| `src/app/api/whatsapp/webhook/route.ts` | GET verify + POST dispatch |
| `src/lib/whatsapp/verify.ts` | HMAC signature verification |
| `src/lib/whatsapp/client.ts` | `sendMessage(to, body, replyTo?)` → Graph API |
| `src/lib/whatsapp/commands.ts` | Command router + formatters (spend/balance/recent) |
| `src/lib/whatsapp/parse.ts` | Strip @mentions, extract command |
| `src/lib/db/schema.ts` | Add `whatsappProcessedMessages` table |
| `drizzle/<new>.sql` | Migration (via `drizzle-kit push`) |

## Implementation tasks

- [ ] **T-1** Add `whatsapp_processed_messages` table to schema; run `drizzle-kit push`. *(AC-7)*
  - TC: insert same id twice → PK violation / upsert-ignore works.
- [ ] **T-2** Implement `src/lib/whatsapp/verify.ts` — HMAC-SHA256 constant-time verify. *(AC-5)*
  - TC-signature-valid, TC-signature-invalid.
- [ ] **T-3** Implement `src/lib/whatsapp/parse.ts` — strip @mention tokens, lowercase, first word. *(AC-9)*
  - TC: `@FamilyBot spend` → `spend`; `  SPEND  ` → `spend`; empty → `''`.
- [ ] **T-4** Implement `src/lib/whatsapp/commands.ts` — three formatters + unknown fallback. *(AC-2, AC-3, AC-4, AC-8)*
  - TC-spend, TC-balance, TC-recent, TC-unknown. Mock Drizzle.
- [ ] **T-5** Implement `src/lib/whatsapp/client.ts` — Graph API POST with bearer token, `context.message_id` threading.
  - TC: request body shape, bearer header set. Mock `fetch`.
- [ ] **T-6** Implement `src/app/api/whatsapp/webhook/route.ts` GET + POST, wire steps 1–11. *(AC-1, AC-6, AC-7)*
  - TC-verify-handshake, TC-allowlist-miss, TC-idempotent-retry, TC-non-text-ignored.
- [ ] **T-7** Document env vars in `.env.local.example` and `docs/deployment_info.md`.
- [ ] **T-8** Manual smoke test: ngrok → Meta webhook config → send `spend`, `balance`, `recent` from test number → verify replies.

## Test plan

| TC | AC | Test |
|---|---|---|
| TC-1 | AC-1 | GET verify handshake — correct token returns challenge, wrong returns 403 |
| TC-2 | AC-5 | POST with valid HMAC → dispatches |
| TC-3 | AC-5 | POST with wrong HMAC → 401, no dispatch |
| TC-4 | AC-2 | `spend` command → formatted reply with month total + top 3 categories |
| TC-5 | AC-3 | `balance` command → per-account balances |
| TC-6 | AC-4 | `recent` command → last 5 transactions |
| TC-7 | AC-8 | Unknown command → "Unknown command…" reply |
| TC-8 | AC-6 | Non-allowlisted sender → 200 silent |
| TC-9 | AC-7 | Duplicate `message.id` → processed once |
| TC-10 | AC-9 | `@FamilyBot spend` → routes to spend |
| TC-11 | — | Non-text message type → 200 silent |

## Cost & AI transparency

- **AI:** None. No paid AI APIs. No toggle needed.
- **Meta WhatsApp Cloud API:** Free for first 1,000 user-initiated conversations/month. For a family group, expected cost: **$0/month**. No outbound marketing templates used.

## Cross-domain impact

- Reads from existing `financials` tables (transactions, categories, accounts). No writes.
- Adds one new table (`whatsapp_processed_messages`) — no impact on other domains.
- Adds 5 new env vars — documented in deployment info.

## Release notes (fill at release)

TBD at commit time.

## Out of scope (v2+)

- Date-range parsing (`spend last month`, `spend 2026-03`)
- Task commands (add/list/done)
- Per-user mapping via `users.whatsapp_phone`
- Real business number migration
- Notion / invoice / calendar commands
- Outbound push notifications (bill reminders, etc.)
