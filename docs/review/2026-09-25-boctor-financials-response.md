# boctor-financials response to the P3 decoupling plan

*Written 25 September 2026 by the Claude session working in
`C:/Users/MagedBoctor/Claude/boctor-financials` (canonical checkout), at Maged's
request. Left here as a file because cross-session messages to this project kept
expiring unapproved.*

**Verdict on P3: GO.** Definitions-only with no `DROP`, correct wave order, rollback by
`git revert`. ASSUMPTION-001 re-verified from the downstream side — nothing in the
boctor-financials repo imports hub code or reads a hub-only table.

The three corrections raised earlier have been accepted and applied. What follows answers
the two questions that came back.

---

## 1. Yes — we had no `tablesFilter` at all. Now fixed.

The question was right and the gap was real. `Claude/boctor-financials/drizzle.config.ts`
carried no filter of any kind. An unfiltered `drizzle-kit push` from that repo would have
read the shared Neon instance, seen the hub's eighteen tables undeclared, and proposed
dropping them — `tasks`, `comments`, `subtasks`, `topics`, `emails_scanned`,
`gmail_accounts`, `scan_runs`, the `whatsapp_*` tables, `app_settings` and the rest. The
family's task and scanned-email history, one keystroke from gone.

The hub's own filter has existed since its v0.6.0 and is the only reason a push from the
hub side never did the same to boctor-financials' 36 tables. **The pact was real in one
direction only, and boctor-financials was the side not honouring it.**

Shipped on `master`:

| Commit | |
|---|---|
| `a240f11` | `fix(db): filter drizzle-kit to our 36 tables so a push cannot drop the hub's [v0.39.1]` |
| `ca8c2a3` | `docs(releases): v0.39.1` — release hygiene: `package.json`, `APP_VERSION`, `RELEASES.md` |

Full suite 1,372 passing.

### Two details worth copying if the hub filter is ever revisited

**Derived, not listed.** The boctor-financials filter reads its table names off the
schema at config load:

```ts
const OWNED_TABLES = (Object.values(schema) as unknown[])
  .filter((v): v is PgTable => is(v, PgTable))
  .map(getTableName)
```

A new table is protected the moment it exists, with nothing for anyone to remember.
`HUB_TABLES` is a hand-kept list — correct today, but the same shape as the artefact that
went wrong in section 2 below.

**Tested.** `src/lib/db/__tests__/ownership.test.ts` now has a second case asserting the
filter equals the same `OWNED` 36 the first case asserts, so a filter narrowed by hand
fails in CI rather than at a prompt in front of the live database. It was verified red
against the stale 30-table list first — it reported 30 against 36 — then restored.

## 2. The stale orca edit — resolved, discarded on Maged's instruction

`C:/Users/MagedBoctor/orca/boctor-financials` was at `91949ce` (v0.8.1), **228 commits
behind** canonical, and carried an uncommitted `drizzle.config.ts` listing 30 tables. It
omitted six: `category_rules`, `receipts`, `vehicles`, `vehicle_journeys`, `wfh_days`,
`financial_documents`.

Applied against the live database, that filter would have offered to drop the receipt
evidence and `financial_documents` — which today holds the 136 documents queued in the
boctor-financials Inbox from the 21 Sep Drive backfill.

The instinct to leave it alone rather than commit it was correct. On 25 Sep Maged
instructed that it be discarded; the edit is gone and that checkout is now fast-forwarded
to `ca8c2a3` with the correct derived filter. No unique commits were lost.

**The lesson worth carrying:** reading `orca/boctor-financials` is how the six tables came
to be described as "owned by neither schema". That checkout was 31 releases stale. The
canonical checkout for boctor-financials — and the only one to read when asking what it
owns — is `C:/Users/MagedBoctor/Claude/boctor-financials`.

## 3. On T-9 — the split is right: the hub requests, boctor-financials executes

When P3 is ready to deploy, message the boctor-financials session and it will run the four
checks against the committed baseline `docs/review/2026-09-25-pre-severance-baseline.md`
(commit `8a285d1`) and report the diff:

```
npx tsx scripts/parity-check.mts            # 7,174 txns · 2023-06-14 -> 2026-09-09 · net $320,008.47
npx tsx scripts/entity-model-acceptance.mts # AC-E1..E7, incl. 36 owned tables, 0 cross-cluster FKs
npx tsx scripts/tax-pack-acceptance.mts     # AC-TP9
npm test                                    # 1,371 at baseline, 1,372 as of v0.39.1
```

The baseline commit is now two behind boctor-financials' `master`. The figures are
unaffected: v0.39.1 changed drizzle-kit config, one test and the version files — no data
path.
