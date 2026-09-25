---
Feature: WhatsApp delivery reliability
Date: 2026-09-25
Tier: MED (score 12 → HIGH recommended; user chose MED)
Status: SIGNED OFF
Target release: v0.6.0
App version at last update: v0.5.0
---

# WhatsApp delivery reliability

## Goal
The daily Gmail digest "works 1–2 times, then stops". The end-to-end review on 2026-09-25 found two independent causes:

1. **Gmail:** the OAuth app was in *Testing*, so the refresh token died every 7 days. This was fixed in the Google Console on 2026-09-25 with no code change.
2. **WhatsApp (this brief):** every outbound message is free-form `type: 'text'`. Meta only delivers free-form messages within 24 h of the recipient last messaging the bot.
   - When nobody replies to a digest, every later digest is silently dropped. So is the ops alert, which is why 20 days of failures produced no alert.
   - `sendMessage` swallows non-2xx responses.
   - The webhook ignores delivery `statuses`.

Outcome: Maged and Mandy get a message every day whether or not they replied the day before. A failed delivery is visible. The 2026-09-05 → 09-24 gap gets scanned.

## User stories
- US-001: As Maged or Mandy, I get a daily WhatsApp notice every day, and one tap shows the full digest.
- US-002: As Maged, I get a WhatsApp alert when the scan fails, even if I haven't messaged the bot for weeks.
- US-003: As Maged, I can see in Settings when WhatsApp last delivered to each recipient, and any failure.
- US-004: As Maged, I can press **Send digest now** instead of waiting for the cron.
- US-005: As Maged, I can scan the emails missed during an outage, after seeing the cost.
- US-006: As Maged, pressing **Reconnect Gmail** tells me when it has not actually fixed anything.

## Key decisions

| ID | Decision | Status |
|---|---|---|
| DEC-1 | Daily digest = Utility template with a "Show digest" quick-reply button; the tap opens the 24 h window and the full digest follows as free-form | **Chosen (user, 2026-09-25)** |
| DEC-2 | Delivery tracking stored in a new `whatsapp_outbound_messages` table | Note |
| DEC-3 | Missed emails: unscanned-first scan + Settings "Scan missed emails" | **Chosen A (user, 2026-09-25)** |
| DEC-4 | Templates created by hand in WhatsApp Manager; names come from env vars | Note |
| DEC-5 | The cron body is extracted into `runDailyDigest()` and shared by cron and Send now | Note |

### DEC-1: Daily digest delivery
- Option A: a notice template plus a *Show digest* button. It is always delivered, keeps the existing reply grammar, and costs one tap.
- Option B: the whole digest in template variables. Variables cannot contain newlines, so the result is poor formatting.
- Option C: stay free-form and rely on a daily inbound message. This is the current failure mode.
- **Chosen: A.**

**DEC-2 note:** each send records the returned `wamid`. The webhook's `statuses[]` updates the row with sent, delivered, read or failed plus the error code. A table rather than columns on snapshots, because it covers every message kind (digest, ops, reply).

**DEC-4 note:** creating templates via the Graph API needs a WABA id and extra permissions for a one-off task. Doing it by hand is two forms in WhatsApp Manager. Env vars: `WHATSAPP_TEMPLATE_DIGEST`, `WHATSAPP_TEMPLATE_OPS_ALERT`, `WHATSAPP_TEMPLATE_LANG` (default `en`).

**DEC-5 note:** Send now runs a fresh scan first, then sends, exactly like the cron. The same code path means no drift between the two.

### DEC-3: Covering missed emails
Root cause: the scan asks Gmail for the **newest 100** emails and drops already-scanned ones *afterwards*. At about 60 emails a day, any gap longer than about 1.5 days is never reached.
- Option A: **unscanned-first scan.**
  - List every message id in the window (paginated) and drop the known ones *before* applying the cap. Take the oldest unscanned first.
  - Add a `from`/`to` date range option.
  - Settings gets a **Scan missed emails** action with a cost estimate. It runs in chunks until nothing remains.
  - Pros: the normal daily scan also self-heals any gap up to its window, so future outages repair themselves.
  - Cons: more change to `run-scan.ts`.
  - Risk: MED.
- Option B: a **one-off local script** (`npm run scan:backfill -- --from 2026-09-05 --to 2026-09-24`) with a cost printout and confirm prompt.
  - Pros: small, with no UI or timeout concerns.
  - Cons: fixes only this gap; the 100-cap trap remains for the next outage.
  - Risk: LOW.
- **Chosen: A** — removes the cause, not just this gap; future outages up to 7 days self-heal.

## Acceptance criteria
- AC-001 [MUST]: **Given** no inbound message from a recipient for more than 24 h, **When** the daily cron runs and the scan succeeds, **Then** the recipient receives the digest template with the date, actionable count and a *Show digest* button. Risk: HIGH
- AC-002 [MUST]: **Given** a recipient taps *Show digest*, **When** the webhook receives the button message, **Then** the full digest is sent as free-form text and a snapshot is persisted, so `task 1` and `reject 2` replies keep working. Risk: HIGH
- AC-003 [MUST]: **Given** the scan fails for every account, **When** the cron runs, **Then** the ops recipient receives the ops-alert template containing the error code, the last successful scan date and a Settings link. Risk: HIGH
- AC-004 [MUST]: **Given** Meta returns non-2xx, **When** `sendMessage` or `sendTemplate` is called, **Then** it throws, and callers count the send as failed rather than sent. Risk: MED
- AC-005 [MUST]: **Given** Meta posts a `statuses` callback, **When** the webhook receives it, **Then** the matching outbound row records the status, timestamp and error code or title. The signature is still verified. Risk: MED
- AC-006 [MUST]: **Given** a Gmail token refresh fails, **When** the error is logged anywhere in the scan or cron path, **Then** no refresh token, access token or client secret appears in the log output. Risk: HIGH (security)
- AC-007 [SHOULD]: **Given** Settings is open, **When** the WhatsApp card renders, **Then** it shows the last delivered time per recipient and the most recent failure (code and title), and flags *Needs attention* if the last digest was not delivered. Risk: LOW
- AC-008 [SHOULD]: **Given** an admin presses **Send digest now**, **When** the request completes, **Then** a scan runs, the digest template goes to all recipients, and a toast shows sent and failed counts. Non-admins get 403. Risk: LOW
- AC-009 [SHOULD]: **Given** `accounts` holds no working refresh token, **When** Maged presses **Reconnect Gmail**, **Then** the API test-refreshes the token first and, on `invalid_grant`, returns the message "Sign out and sign in again, then Reconnect" without saving. Risk: LOW
- AC-010 [MUST]: **Given** unscanned emails between 2026-09-05 and 2026-09-24, **When** Maged runs the backfill after seeing the estimated email count and AI cost, **Then** every unscanned email in the range is classified. A re-run finds 0 remaining. Risk: MED
- AC-011 [MUST]: **Given** a 3-day outage, **When** the next daily scan runs, **Then** it scans the oldest unscanned emails in its 7-day window first, so the gap closes with no manual step. Risk: MED

## Out of scope
- A second alert channel (email or SMS) for when WhatsApp itself is down. That would need a new provider; see the shared-messaging note in global CLAUDE.md.
- Meta Business verification and template submission via API.
- Mandy as a real hub user (tracked in `mandy_hub_access_todo`).
- Deleting `/financials` from the hub (P3 of the extraction; separate release).

## Assumptions
- ASSUMPTION-001: Meta approves both templates as **Utility**. Impact if wrong: they are billed as Marketing, which costs more but still works.
- ASSUMPTION-002: A quick-reply tap arrives as `type: 'button'` and opens the 24 h window. Impact if wrong: AC-002 needs an interactive-message redesign.
- ASSUMPTION-003: Template cost is a few cents per message, about 60 a month for two recipients. Impact if wrong: cost only; confirm on Meta's pricing page.
- ASSUMPTION-004: The backfill is about 1,200 emails before the noise pre-filter; on Haiku 4.5 that is estimated under US$2. Impact if wrong: the estimate shown before running catches it.

## Templates (Maged creates these in WhatsApp Manager → Message templates; category Utility; language English)

**`family_hub_digest`**
- Body: `Boctor Family Hub, {{1}}: {{2}} actionable emails from the last scan. Tap below to see them.`
- Quick-reply button: `Show digest`

**`family_hub_scan_alert`**
- Body: `Family Hub Gmail scan failed ({{1}}). Last successful scan: {{2}}. Today's digest was not sent. Fix it here: {{3}}`

## Schema changes
```ts
export const whatsappOutboundMessages = pgTable('whatsapp_outbound_messages', {
  id: text('id').primaryKey(),                 // Meta wamid
  recipient: text('recipient').notNull(),      // E.164
  kind: text('kind').notNull(),                // digest_notice | digest_full | ops_alert | reply
  status: text('status').notNull().default('accepted'), // accepted | sent | delivered | read | failed
  errorCode: integer('error_code'),
  errorTitle: text('error_title'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  statusAt: timestamp('status_at'),
})
```
Applied with `npx tsx scripts/apply-whatsapp-outbound-messages.ts` (never `drizzle-kit push` on the shared DB). Additive only; rollback is `DROP TABLE`.

## API sketches
| Endpoint | Auth | Request → Response | ACs |
|---|---|---|---|
| `POST /api/whatsapp/webhook` (extended) | Meta signature | now handles `statuses[]` and `type:'button'` | AC-002, AC-005 |
| `POST /api/whatsapp/digest/send` | admin | `{}` → `{ sent, failed, scanErrors, suppressed }` | AC-008 |
| `GET /api/whatsapp/delivery-health` | admin | → `[{ recipient, lastDeliveredAt, lastFailure }]` | AC-007 |
| `GET /api/scan/backfill/estimate?from&to` | admin | → `{ unscanned, estCostUsd, chunks, truncated }` (range ≤ 30 days) | AC-010 |
| `POST /api/scan/backfill` | admin | `{ from, to }` → `{ processed, saved, actionable, remaining, stalled }` (one chunk ≤ 100; the UI loops until remaining = 0 or stalled) | AC-010 |
| `POST /api/settings/connect-gmail` (changed) | session | test-refresh first; 409 with a clear message on `invalid_grant` | AC-009 |

## Implementation tasks
One domain per branch, working in the Orca checkout, port 3000.

### Wave 1: Schema (`schema/whatsapp-outbound-messages`)
- [x] **T-1** [S]: add the `whatsappOutboundMessages` table; apply via `scripts/apply-whatsapp-outbound-messages.ts` (NOT drizzle-kit push — shared DB, would drop bf_* tables) · owns `src/lib/db/schema.ts`, that script · AC-005 · TC-005

### Wave 2: WhatsApp (`fix/whatsapp/template-delivery`)
- [x] **T-2** [M]: `sendMessage` throws on non-2xx and returns the wamid; add `sendTemplate()`; both record an outbound row · owns `src/lib/whatsapp/client.ts` · AC-004 · TC-004
- [x] **T-3** [M]: extract `runDailyDigest()` and `buildDigestPayload()` from the cron route; the cron sends the notice template · owns `src/lib/whatsapp/daily-digest.ts`, `src/app/api/cron/digest/route.ts`, `digest-sender.ts` · AC-001 · TC-001
- [x] **T-4** [M]: the webhook handles the *Show digest* button (full digest plus snapshot) and `statuses[]` · owns `src/app/api/whatsapp/webhook/route.ts` · AC-002, AC-005 · TC-002, TC-005
- [x] **T-5** [S]: the ops alert uses the template · owns `ops-alert.ts` · AC-003 · TC-003
- [x] **T-6** [S]: `POST /api/whatsapp/digest/send` and `GET /api/whatsapp/delivery-health` · owns `src/app/api/whatsapp/digest/send/route.ts`, `delivery-health/route.ts` · AC-007, AC-008 · TC-007, TC-008

### Wave 3: Scan (`fix/scan/unscanned-first-and-log-hygiene`)
- [x] **T-7** [S]: redact tokens from logged Gmail errors in `client.ts`, `run-scan.ts` and the cron route · AC-006 · TC-006
- [x] **T-8** [M]: unscanned-first listing, date-range option, backfill estimate and chunk APIs · owns `run-scan.ts`, `src/lib/gmail/client.ts`, `src/app/api/scan/backfill/*` · AC-010, AC-011 · TC-010, TC-011

### Wave 4: Settings (`feat/settings/whatsapp-health`)
- [x] **T-9** [M]: WhatsApp card showing delivery health, **Send digest now** and **Scan missed emails** (estimate, confirm, progress) · owns `src/app/(dashboard)/settings/page.tsx`, `src/components/settings/*` · AC-007, AC-008, AC-010 · TC-007, TC-008, TC-010
- [x] **T-10** [S]: Reconnect test-refreshes before saving · owns `src/app/api/settings/connect-gmail/route.ts` · AC-009 · TC-009

## Test cases
- TC-001 [AUTO] AC-001: `src/lib/whatsapp/__tests__/daily-digest.test.ts`. A successful scan sends the template with the right variables to every recipient.
- TC-002 [AUTO] AC-002: `webhook.test.ts`. A button payload sends the full digest and persists a snapshot.
- TC-003 [AUTO] AC-003: `ops-alert.test.ts`. On failure, the template goes to the ops recipient only.
- TC-004 [AUTO] AC-004: `client.test.ts`. A 400 from Meta throws; a 200 returns the wamid and inserts a row.
- TC-005 [AUTO] AC-005: `webhook.test.ts`. A `statuses` failed callback updates the row with code 131047.
- TC-006 [AUTO] AC-006: `scan-errors.test.ts`. The formatted log of a gaxios `invalid_grant` error contains no `refresh_token` value.
- TC-007 [MANUAL] AC-007: open Settings and check the per-recipient last delivered time.
- TC-008 [MANUAL] AC-008: press Send digest now; the template arrives on both phones; the toast shows `sent 2`.
- TC-009 [AUTO] AC-009: `connect-gmail.test.ts`. On `invalid_grant`, the route returns 409 and the DB is unchanged.
- TC-010 [MANUAL] AC-010: run the backfill for 09-05 → 09-24; check the estimate is shown and the re-run reports 0 remaining.
- TC-011 [AUTO] AC-011: `run-scan.test.ts`. With 150 ids in the window, 100 of them known, the scan processes the 50 unknown, oldest first.
- TC-012 [MANUAL] AC-001: the real test. The 20:00 digest template arrives on 3 consecutive days with no replies in between.

## Cross-domain impact
WhatsApp, Scan and Settings. The shared schema gains one additive table. New env vars: `WHATSAPP_TEMPLATE_DIGEST`, `WHATSAPP_TEMPLATE_OPS_ALERT`, `WHATSAPP_TEMPLATE_LANG`, plus `WHATSAPP_OPS_NUMBER`, which should now be set.

## Release notes
### User-facing
- (filled at release)
