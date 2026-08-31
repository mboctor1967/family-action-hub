---
Feature: Boctor Financials — extraction from family-action-hub
Date: 2026-08-31
Tier: HIGH (score 11 — schema +2, new endpoints +2, cross-domain +2, files >5 +2, new UI +1, ACs >4 +2)
Status: APPROVED — implementation plan next
Scope: v1 (parity extraction only)
Supersedes: the "separate deploys" rejection in memory note `modular_monolith_refactor` (2026-04-16)
App version at authoring: v0.5.0
---

# Boctor Financials — extraction design

## 1. Why

Financials is being grown into a substantially larger product — cost analysis, net
worth, retirement scenarios, per-asset views (cars, houses), and identification of
simplification and optimisation opportunities. That product needs its own surface to
grow into, not a corner of a family portal.

This is the stated driver, and it matters because it rules out the cheaper answers.
Blast radius and cognitive load would both have been better served by the queued
modular-monolith work. Neither is the reason. The reason is room to build.

### Relationship to the 2026-04-16 decision

On 2026-04-16 the hub chose a **modular monolith** and explicitly rejected separate
deploys, estimated then at 6–10 weeks plus auth duplication. That decision also said:

> Forward-compatible: if WhatsApp bot or Financials ever need extraction to their own
> deploy, the boundaries are already drawn.

This spec supersedes the rejection, on evidence the April decision did not have. The
estimate assumed the seam would need to be *created*. Measurement (§2) shows it
already exists. The modular-monolith work is therefore **not a prerequisite** — for
Financials it would mean building the boundary immediately before crossing it.

The modular-monolith brief remains valid for the *remaining* domains (Tasks, Scan,
Notion, WhatsApp, Settings) and stays queued, unaffected by this work.

## 2. Measurements

Taken against `b91aa89` (v0.5.0) on 2026-08-31. These numbers are the evidence for
every decision below; re-measure before acting if this spec has aged.

| Measure | Value |
|---|---|
| Financials source | **16,633 LOC across 100 files** |
| Whole `src/` | 31,599 LOC across 269 files |
| **Financials share of the codebase** | **53%** |
| API routes under `/api/financials` | 43 |
| Dashboard pages under `/financials` | 12 |
| DB tables owned by financials | 14 of 31 |
| **Inbound coupling** (non-financials code importing financials) | **4 references, all type-only** |
| **FKs leaving the financials cluster** | **2**, both nullable, both `onDelete: 'set null'` |

### Inbound coupling, in full

```
src/app/api/settings/ai-cost-estimate/route.ts   import type { AiCostEstimate }
src/components/settings/ai-cost-panel.tsx        import type { AiCostEstimate }
src/lib/gdrive/client.ts                         import type { DriveFile }
src/lib/gdrive/client.ts                         import { SUPPORTED_MIME_TYPES }
```

Three type-only imports and one constant. That is the entire code-level dependency of
the hub on its largest domain.

### Outbound coupling

Financials imports `@/lib/db` (90), `@/components/ui` (65), `@/lib/auth` (55),
`@/lib/gdrive` (9), `@/lib/gmail/search` (1), `@/lib/app-settings` (1), `@/lib/utils` (1).
All infrastructure. No domain logic from Tasks, Scan, Notion or WhatsApp.

## 3. Decisions

Each decision was taken explicitly during brainstorming on 2026-08-31.

### D1 — Separate repo, separate Vercel project, shared Neon database

The 14 financial tables stay where they are; the new app owns them. The hub owns its 17.

**Rationale:** zero data migration — day one the new app points at existing data and
works. The tables are already disjoint, so "shared database, separate ownership"
describes what is *already true* rather than a compromise.

**Rejected:** separate database (adds a real migration of live, tax-critical data for
isolation whose value is limited when one person uses both apps); Turborepo monorepo
(new machinery to maintain solo, and weakest against the stated goal of focus).

**Explicitly preserved:** D1 does not foreclose a separate database later. §4.2 keeps
that path to a `pg_dump` of 14 tables. If separation is ever wanted, take it then.

### D2 — v1 is parity, not new features

v1 is the existing 16,633 LOC moved and working. Wealth features start in v2.

**Rationale:** the extraction is mechanical and low-risk; every wealth feature depends
on this transaction and account data anyway. Shipping parity first means one owner of
financial data from day one and no interim split-brain.

**Rejected:** vision-first (two apps owning financial data for the whole interim — the
exact split-brain this work exists to remove, and "migrate later" tends not to happen);
parity-plus-one-feature (couples a low-risk move to an unscoped new feature, and makes
move bugs indistinguishable from feature bugs).

### D3 — Own NextAuth tables, own Google grant

The new app gets `bf_profiles`, `bf_accounts`, `bf_sessions`, `bf_verification_tokens`
in the shared database. Same Google Cloud OAuth client, additional redirect URIs. Sign
in to each app once.

**Rationale:** it needs a durable Google refresh token of its own regardless, for Drive
and Gmail ingest (§6). Independent grants mean a repeat of the 2026-05 `invalid_client`
outage takes out one app, not both. Zero shared tables keeps D1's later-separation path
open.

**Rejected:** sharing the hub's auth tables — the single choice that would undo the
clean seam, permanently coupling the apps at the DB level and putting both behind one
refresh token.

### D4 — Parallel run, then delete

Both apps live against the same tables during an overlap window; the hub's
`/financials` is deleted in a separate, later release.

**Rationale:** the shared-database choice makes this nearly free — there is nothing to
sync, the new app is a different UI over the same rows. Rollback is "use the hub".
Tax prep is never unavailable.

**Rejected:** big bang (rollback means reverting a large deletion under pressure, and a
parity gap would be discovered with no fallback); incremental by domain (slices are not
independent — tax prep reads transactions, which read accounts and entities — so it
sustains split-brain for weeks).

### D5 — Both local checkouts from day one

`orca/boctor-financials` and `Claude/boctor-financials`, memory junctioned, one shared
port.

**Rationale:** user preference; either editor works immediately.

**Known risk, accepted:** this is the configuration that stranded uncommitted v0.5.0
work in one checkout while the other sat stale — discovered at the start of this same
session. Mitigation in §8: VS Code is canonical for memory, one dev server at a time,
and a "commit before switching editors" rule in the project's `CLAUDE.md`.

### D6 — Name: `boctor-financials`

Repo, Vercel project, local folder, and the `bf_` auth-table prefix.

**Accepted trade-off:** the name describes the starting point, not the destination —
net worth and retirement scenarios are wealth management. Distinctness from the existing
`babyccino-financials` (port 3003) was judged worth more than future-proofing.

## 4. Architecture

### 4.1 Shape

```
family-action-hub                          boctor-financials
(Vercel project, own repo)                 (Vercel project, own repo)
├── Tasks, Scan, WhatsApp,                 ├── Transactions, Accounts, Entities
│   Notion, Settings                       ├── Categorisation, Invoices, Tax prep
├── owns 17 tables                         ├── owns 14 tables + 5 of its own
├── NextAuth: profiles/accounts/sessions   ├── NextAuth: bf_profiles/bf_accounts/...
└── home NavCard ──── hyperlink ─────────► └── own Google grant (Drive + Gmail)

                    ↘  one Neon database  ↙
```

Neither app imports the other. Neither reads the other's tables. The only runtime link
is a hyperlink.

### 4.2 Table ownership

**Moves to `boctor-financials` (14):** `financial_categories`, `financial_subcategories`,
`financial_entities`, `financial_accounts`, `financial_statements`,
`financial_transactions`, `transaction_splits`, `financial_assumptions`, `parse_errors`,
`ato_codes`, `invoice_tags`, `export_jobs`, `invoice_suppliers`, `invoices`

**Created by it (5):** `bf_profiles`, `bf_accounts`, `bf_sessions`,
`bf_verification_tokens`, `bf_app_settings`

**Stays with the hub (17):** `profiles`, `gmail_accounts`, `topics`, `emails_scanned`,
`tasks`, `comments`, `subtasks`, `ai_feedback`, `ai_skill_versions`, `scan_runs`,
`accounts`, `sessions`, `verification_tokens`, `app_settings`, `notion_dedupe_reports`,
`whatsapp_processed_messages`, `whatsapp_digest_snapshots`

**Severances — the complete list.** After these, zero references cross the boundary.

| # | What | Now | After | Migration |
|---|---|---|---|---|
| S1 | `export_jobs.requested_by` | `uuid` → `profiles.id`, nullable, `set null` | `text` (email) | Backfill from `profiles.email`, drop constraint, alter type |
| S2 | `financial_assumptions.updated_by` | `uuid` → `profiles.id`, nullable, `set null` | `text` (email) | Same |
| S3 | `isClaudeAtoEnabled` | reads hub `app_settings` | reads `bf_app_settings` | Copy the one key across |

Both FK columns are nullable audit fields with `onDelete: 'set null'` — nothing depends
on referential integrity to `profiles`. S1 and S2 are additive-then-swap and can be
applied before any code moves, with the hub still running.

### 4.3 Shared code

Copied into the new repo, not packaged or submoduled:

`components/ui` · `lib/db` · `lib/auth` · `lib/gdrive` · `lib/gmail/search` · `lib/utils`

**Rationale:** shadcn components are designed to be owned per-project; `lib/db` is
roughly 20 lines. A shared package buys deduplication at the cost of the independence
this whole exercise is for.

The three borrowed symbols (`AiCostEstimate`, `DriveFile`, `SUPPORTED_MIME_TYPES`) move
to the new repo and are **deleted from the hub's `types/financials.ts`**. The hub's two
consumers (`api/settings/ai-cost-estimate`, `components/settings/ai-cost-panel`) and
`lib/gdrive/client.ts` get local definitions.

## 5. AI cost transparency

`lib/financials/ai-cost.ts` and the `isClaudeAtoEnabled` toggle move with the app. Per
project convention, the new app must carry its own settings surface exposing the toggle
(default OFF) and the live per-run / monthly / backfill cost estimate before it can be
enabled. The hub's `components/settings/ai-cost-panel.tsx` is the reference
implementation; the hub's copy is deleted when `/financials` is deleted.

## 6. Google grant

Scopes required: **Drive** (statement and invoice ingest from
`GDRIVE_FINANCIALS_FOLDER_ID`) and **Gmail read** (`lib/financials/invoice-scanner.ts`
searches Gmail for invoices — confirmed at `invoice-scanner.ts:20`).

Same Google Cloud OAuth client; add redirect URIs for `localhost:3007` and the Vercel
production URL. `access_type=offline` + `prompt=consent`, matching the hub's `auth.ts`,
so a durable refresh token is minted.

**Standing hazard:** rotating `GOOGLE_CLIENT_SECRET` now invalidates **two** grants.
Both apps must be re-consented after any rotation. This must be recorded in both repos'
deployment docs — see memory `google_secrets_rotation_todo`, where exactly this step
being missed cost four months of silent scan failure.

## 7. Cutover

| Phase | Action | Rollback |
|---|---|---|
| P0 | Apply S1–S3 to the shared DB while the hub still runs | Columns are additive; revert is a drop |
| P1 | Stand up `boctor-financials` to parity. Both apps live against the same tables | Use the hub |
| P2 | Use the new app exclusively for ~2 weeks, **including one full tax-prep export** | Use the hub |
| P3 | Separate release: delete `/financials` from the hub — 100 files, 14 schema definitions, 13 home cards → 1 link-out card | `git revert` |

P2's tax-prep export is the real acceptance test. Nothing else exercises as much of the
stack at once.

## 8. Local workspace bootstrap

| Item | Value |
|---|---|
| Folders | `C:/Users/MagedBoctor/orca/boctor-financials` · `C:/Users/MagedBoctor/Claude/boctor-financials` |
| Port | **3007**, shared between checkouts — one dev server at a time |
| Port registry | Add row to `~/.claude/CLAUDE.md`; 3008 becomes next free |
| Memory | VS Code checkout canonical; Orca workspace junctioned to it (see memory `polyscope_memory_junction`) |
| `.env.local` | `AUTH_URL` (:3007), `AUTH_SECRET` (new), `GOOGLE_CLIENT_ID`/`SECRET` (same client), `DATABASE_URL` (same Neon), `ANTHROPIC_API_KEY`, `GDRIVE_FINANCIALS_FOLDER_ID`, `BLOB_READ_WRITE_TOKEN` |
| Google Console | Add `http://localhost:3007/api/auth/callback/google` and the Vercel production callback |
| Project `CLAUDE.md` | Carries the release gate, TDD discipline and commit conventions from the hub, **plus** "commit before switching editors" (D5 mitigation) |

## 9. Acceptance criteria

- **AC-001 [MUST]** — Given the new app is deployed, When signing in with the Google
  account, Then a session is created in `bf_sessions` and a refresh token is stored in
  `bf_accounts` with Drive and Gmail scopes.
- **AC-002 [MUST]** — Given identical underlying data, When transaction counts and
  category totals are compared per financial year between the two apps, Then they match
  exactly.
- **AC-003 [MUST]** — Given the same FY and entity, When a tax export bundle is produced
  from both apps, Then the bundles are **content-equivalent**: identical entity set,
  transaction set, per-category totals and ATO codes, and the same file manifest.
  Byte-comparison is explicitly *not* the test — the PDFs embed generation timestamps.
- **AC-004 [MUST]** — Given the new app is running, When any query it issues is traced,
  Then it touches only its own 19 tables.
- **AC-005 [MUST]** — Given S1–S3 are applied, When the schema is inspected, Then no
  foreign key crosses between the financial cluster and the hub cluster.
- **AC-006 [MUST]** — Given the hub after P3, When it is built and tested, Then it
  compiles, its suite passes, and no reference to `financials` remains outside the
  home-page link.
- **AC-007 [SHOULD]** — Given a fresh clone in either editor, When the §8 checklist is
  followed, Then the dev server serves on :3007 and Google sign-in succeeds.
- **AC-008 [MUST]** — Given AI-backed ATO proposals, When the feature is presented, Then
  the toggle defaults OFF and a live cost estimate is shown before enabling.

## 10. Out of scope for v1

Net worth, asset register (cars, houses), retirement scenarios, cost-optimisation
identification. These are the *reason* for the extraction and each gets its own brief
once the foundation stands.

Also out of scope: migrating to a separate database (D1 keeps it cheap — take it later
if wanted); the modular-monolith work for the hub's remaining domains (stays queued);
the `timestamp` → `timestamptz` migration (logged follow-up from v0.5.0);
`middleware.ts` → `proxy` rename (Next.js 16 deprecation, applies to both repos).

## 11. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Schema drift — two Drizzle files over one DB | Med | Disjoint ownership is convention-enforced and reviewable in one `grep`; AC-004 tests it |
| Two checkouts diverge (D5) | Med | VS Code canonical, one dev server, "commit before switching editors" in `CLAUDE.md` |
| Parity gap found after P3 | Low | P2's two-week exclusive-use window with a full tax export |
| Secret rotation now breaks two apps | Med | §6; record in both deployment docs |
| Extraction stalls half-done | Med | P1 is all-or-nothing to parity; no partial-domain states (D4) |

## 12. Follow-ups

- Re-scope the queued modular-monolith brief once Financials is gone — the hub drops
  from 31,599 to roughly 15,000 LOC, which may change its tier.
- Decide whether the hub keeps any financial summary on its home page or only a link.
- Revisit D6 (the name) before the first wealth feature ships, while renaming is cheap.
- **Pre-existing bug found during this review:** the home page has a "Duplicate Detection"
  card at `page.tsx:369` pointing to `/financials/duplicates`, but no such page exists
  (12 pages under `(dashboard)/financials`, none named `duplicates`). Unrelated to this
  work. Decide during P1 whether to build the page or drop the card — do not port a dead
  link into the new app.
