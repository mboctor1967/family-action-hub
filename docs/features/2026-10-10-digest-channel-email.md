---
Feature: Digest delivery channel — WhatsApp, email, or both
Date: 2026-10-10
Tier: HIGH (score 10 — new endpoints +2, cross-domain +2, files >5 +2, new UI +1, new behaviour +1, ACs >4 +2)
Status: BUILT — awaiting release gate
App version at authoring: v0.7.0 — releasing as v0.8.0
---

# Digest delivery channel

## 1. Goal

Make the daily digest arrive. Today it does not, and has not since 4 October.

The scan is healthy and has run every day — 57 emails and 2 actionable items on 9 October.
The digest is built correctly. **Meta rejects every send**, because the hub has no approved
message template and a free-form message is only deliverable inside WhatsApp's 24-hour
customer-service window:

```
error_code 131047  "Re-engagement message"     every send since 2026-10-04
```

The single send that succeeded — 3 October, `+61412408587`, status `read` — landed only
because an inbound message that day had opened the window.

Unblocking WhatsApp needs work inside Meta (templates, and a WhatsApp Business Account
assigned to the `Familyhubbot` System User, which currently has none). That is outside
this codebase and has not moved in two weeks. **Email does not have a 24-hour window, a
template, or an approval queue.** This feature adds email as a delivery channel and lets
the channel be chosen.

## 2. User stories

- **US-001** — As Maged, I want to choose whether the digest goes to WhatsApp, email, or
  both, so a failure in one channel does not mean no digest at all.
- **US-002** — As Maged, I want the email digest to carry the same items, links and
  counts as the WhatsApp one, so switching channel costs me no information.
- **US-003** — As Maged, I want to see on the Settings page which channel is active and
  change it there, without a deploy.

## 3. Key decisions

### DEC-1 — Send email through the existing Google OAuth, not a new provider

Add `https://www.googleapis.com/auth/gmail.send` to the scopes the hub already requests.

**Rationale.** The user-level standing instruction is explicit: *"When an app needs to send
SMS, WhatsApp or email, raise the shared-messaging question before adding a provider."*
This adds **no provider, no credential and no cost** — it widens a grant that already
exists. A re-sign-in is required, and one is already owed for P3 AC-007 (the Drive scope
was dropped when financials left), so the consent cost is zero.

**Rejected:** Resend or similar (a new provider, the exact thing the instruction says to
raise first); extracting boctor-financials' `src/lib/notifications/` into a shared package
first (the right long-term answer, recorded in memory `shared-messaging-service`, but it
is SMS-only today and turning it into a shared email package is a project — the digest
stays broken meanwhile).

**Consequence, stated plainly:** the digest arrives *from Maged's own Gmail address*, not a
service sender. Acceptable for a two-person household app; revisit if it ever leaves it.

### DEC-2 — The channel lives in `app_settings`, not an env var

Key `digest_channel`, one of `whatsapp` | `email` | `both`. Default **`both`**.

**Rationale.** `app_settings` is the hub's existing key-value store with `getSetting`/
`setSetting` already in use by the digest pipeline (`whatsapp_last_digest_stats`). A
setting the user can flip on the Settings page without a deploy is the point of US-003;
an env var would need a redeploy each time.

**Default `both`, not `email`:** email starts working immediately, and WhatsApp resumes by
itself the day the templates are approved and the env vars set — no second change. The
WhatsApp failures continue to be logged in `whatsapp_outbound_messages` until then, which
is honest and already the case.

### DEC-3 — Recipients from an env var, falling back to the connected Gmail account

`DIGEST_EMAIL_RECIPIENTS`, comma-separated. When unset, the digest goes to the address of
the connected Gmail account.

**Rationale.** Mirrors how WhatsApp recipients already work (`WHATSAPP_ALLOWED_NUMBERS`),
needs no schema change, and the fallback means the feature works the moment it deploys
with nothing configured.

### DEC-4 — One channel failing must not suppress the other

Each channel is attempted independently and its outcome recorded separately. A WhatsApp
rejection — which is the current steady state — must never prevent the email from going.

**Rationale.** This is the whole point of the feature. The existing pipeline returns a
single `{sent, failed}`; it becomes per-channel.

## 4. Acceptance criteria

- **AC-001 [MUST]** — Given `digest_channel` is unset, When the digest runs, Then it is
  treated as `both`.
- **AC-002 [MUST]** — Given `digest_channel` is `email`, When the digest runs, Then no
  WhatsApp send is attempted and no row is written to `whatsapp_outbound_messages`.
- **AC-003 [MUST]** — Given `digest_channel` is `whatsapp`, When the digest runs, Then no
  email is sent.
- **AC-004 [MUST]** — Given `digest_channel` is `both` and the WhatsApp send throws, When
  the digest runs, Then the email is still sent and the result reports the WhatsApp
  failure. *(DEC-4 — the current production state.)*
- **AC-005 [MUST]** — Given actionable items exist, When the email digest is built, Then
  it carries the same item count, date label and per-item links as the WhatsApp digest.
- **AC-006 [MUST]** — Given the email is built, When it is sent, Then it is a
  `multipart/alternative` with both a `text/plain` and a `text/html` part. *(User's
  standing rule: never markdown in an email body.)*
- **AC-007 [MUST]** — Given an admin opens Settings, When the page loads, Then the current
  channel is shown and can be changed, and the change persists across a reload.
- **AC-008 [MUST]** — Given a non-admin calls the channel API, When they PUT, Then they
  get 403.
- **AC-009 [MUST]** — Given an invalid channel value is PUT, When it is validated, Then it
  is rejected with 400 and the stored value is unchanged.
- **AC-010 [SHOULD]** — Given the Gmail grant lacks `gmail.send`, When an email digest is
  attempted, Then the failure says so explicitly rather than failing opaquely.

## 5. Schema and API

**Schema:** none. `app_settings` is an existing key-value table.

| Endpoint | Method | Returns |
|---|---|---|
| `/api/settings/digest-channel` | `GET` | `{ channel: 'whatsapp' \| 'email' \| 'both' }` |
| `/api/settings/digest-channel` | `PUT` | `{ channel }` — 400 on an invalid value, 403 for non-admin |

Both carry the project's standard auth pattern (401 without a session, 403 without `admin`).

## 6. Implementation tasks

### Wave 1 — the channel setting

- [ ] **T-1** (S) — `src/lib/digest/channel.ts`: `DigestChannel` type, `DIGEST_CHANNEL_KEY`,
  `parseChannel()` (unknown → `both`), `getDigestChannel()`, `setDigestChannel()`.
  · satisfies AC-001, AC-009 · test: TC-001, TC-002
- [ ] **T-2** (S) — `GET`/`PUT /api/settings/digest-channel`.
  · satisfies AC-007, AC-008, AC-009 · test: TC-003

### Wave 2 — the email channel

- [ ] **T-3** (M) — `src/lib/email/gmail-send.ts`: build a `multipart/alternative` MIME
  message, base64url it, POST to `gmail.users.messages.send` with the stored token.
  Surface a missing `gmail.send` scope as a named error.
  · satisfies AC-006, AC-010 · test: TC-004, TC-005
- [ ] **T-4** (M) — `src/lib/email/digest-email.ts`: render `DigestItem[]` to HTML and
  plain text. Inline styles only — Gmail strips `<style>` blocks.
  · satisfies AC-005, AC-006 · test: TC-006
- [ ] **T-5** (S) — `auth.ts`: add `gmail.send` to the requested scopes.
  · satisfies AC-010

### Wave 3 — wire it together

- [ ] **T-6** (M) — `daily-digest.ts` honours the channel; per-channel results; a throw in
  one channel cannot stop the other.
  · satisfies AC-002, AC-003, AC-004 · test: TC-007, TC-008, TC-009
- [ ] **T-7** (S) — `src/components/settings/digest-channel-card.tsx` + mount on Settings.
  · satisfies AC-007

## 7. Test cases

| TC | Covers | What it asserts |
|---|---|---|
| TC-001 | AC-001, AC-009 | `parseChannel` maps `undefined`, `null`, `''` and junk to `both`; accepts the three valid values |
| TC-002 | AC-001 | `getDigestChannel` returns `both` when the key is absent |
| TC-003 | AC-008, AC-009 | PUT returns 403 without admin; 400 for an invalid value, and the stored value does not change |
| TC-004 | AC-006 | The MIME body contains both a `text/plain` and a `text/html` part, and a correct `multipart/alternative` boundary |
| TC-005 | AC-010 | A 403 `insufficientPermissions` from Gmail surfaces as a named scope error, not a generic failure |
| TC-006 | AC-005 | The rendered email contains every item's subject and link, and the same count as the WhatsApp digest for the same input |
| TC-007 | AC-002 | Channel `email` → the WhatsApp client is never called |
| TC-008 | AC-003 | Channel `whatsapp` → the email sender is never called |
| TC-009 | AC-004 | Channel `both` with the WhatsApp send throwing → the email still sends, and the result reports `whatsapp: failed, email: sent` |

## 8. Release notes

The daily digest now goes to email as well as WhatsApp, and you choose which on the
Settings page.

**Why:** between 4 and 10 October not one digest arrived. The scan had run perfectly
every day — 57 emails and 2 actionable on the 9th — but Meta rejected every single send
with `131047 Re-engagement message`: a free-form WhatsApp message is only delivered
within 24 hours of you messaging the bot. The one that got through, on 3 October, landed
only because an inbound message that day had opened the window. Nothing warned you,
because the scan-failure alert goes down the same blocked path.

Email has no such window. It sends through the Gmail account already connected — no new
provider, no new credential, no cost.

**Default is Both.** Email starts working immediately; WhatsApp resumes on its own the
day its templates are approved in Meta, with no second change needed.

### Test results — 2026-10-10

| TC | Result |
|---|---|
| TC-001, TC-002 (channel parsing, default) | PASS |
| TC-003 (API auth + validation) | PASS |
| TC-004, TC-005 (MIME, scope error) | PASS |
| TC-006 (email content parity) | PASS |
| TC-007, TC-008, TC-009 (channel routing) | PASS |

Suite **252 passed / 33 files** (was 225/30 — 27 new). `tsc --noEmit` clean. `next build`
clean. The two remaining eslint `no-explicit-any` in the new route are the
`(session.user as any).role` auth pattern CLAUDE.md prescribes, matching every other
admin API in the hub.

## 9. Cross-domain impact

- **Auth** — `auth.ts` scope change. Requires a sign-out/sign-in, then **Reconnect Gmail**
  in Settings so the widened grant reaches `gmail_accounts` (the table the sender reads).
  A re-sign-in is already owed for P3 AC-007; fold them together.
- **Settings** — one new card.
- **Scan / WhatsApp** — `daily-digest.ts` changes shape; the WhatsApp path itself is
  untouched.
- **boctor-financials** — none. No shared table is touched.

## 10. Out of scope

- Fixing WhatsApp. That needs templates created and approved in Meta and a WABA assigned
  to the `Familyhubbot` System User — outside this repo. Separately tracked.
- The shared messaging package (memory `shared-messaging-service`) — still the right
  long-term answer, still a project.
- Per-recipient channel choice. One setting for the household.
