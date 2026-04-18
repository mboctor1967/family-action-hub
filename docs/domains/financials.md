# Financials

Core personal/business financial tracking — accounts, transactions, categorization, coverage, spending analysis, tax prep. Excludes the Invoices sub-domain (see `invoices.md`).

**Path ownership:** `src/app/(dashboard)/financials/*` (excl. `/invoices`), `src/app/api/financials/*` (excl. `/invoices`), `src/components/financials/*`, `src/lib/financials/*`

## Shipped

- **v0.1.4 (stranded until 2026-04-17 recovery)** — transaction fingerprinting + QIF import + bank codes, spending trend chart, coverage tab with FY grouping + per-account rows + statement detail, account filter + categorize/import UI polish
- **v0.1.2 — Phase F1 Tax Prep** — `/financials/tax` tabbed view, entity-subfoldered ZIP export, rule-based ATO proposer, optional Claude AI enhancement, AI cost panel
- **v0.1.1** — UI refresh (nav bars removed, NavCards compacted)
- Pages live: `/financials`, `/accounts`, `/assumptions`, `/categories`, `/categorize`, `/coverage`, `/import`, `/spending`, `/subscriptions`, `/tax`, `/transfers`
- APIs live: accounts, assumptions, ato-codes, auto-categorize, categories, counts, coverage, entities, export, ingest, merchants, preview, reset, scan, spending, statements, subcategories, subscriptions, summary, tax, transactions, transfers

## In-flight

- **`recovery/financials-merge` branch** (commit `d16dc0f`) — merges the stranded `feat/financials-fingerprint-dedupe` work back into master's line. **Not yet shipped to master.** Blocks everything else until merged + deployed.

## Queued (next)

1. **Ship the recovery merge** — version bump + CHANGELOG + deploy. Release first before starting anything new in this domain.
2. **Taxonomy simplification** (memory: `taxonomy_simplification_deferred.md`) — replace legacy mixed taxonomy + dual ATO columns with two ATO-aligned trees (Personal + Business). Blocked on F1 shipping + real-data validation from end-of-FY use.
3. **Persist filter selections** (memory: `persist_filter_selections.md`) — remember filters on Spending (and other filter-heavy pages) across reloads. localStorage first, DB later.
4. **Enable `/financials/duplicates`** — NavCard exists on home as "Coming soon" (home page.tsx:329–335); route not built.
5. **Server-compute Category Manager stats** — home card currently shows hardcoded `'19'`/`'42'` (page.tsx:251–253).

## Deferred

- **Phase F2 — Invoice scanner full integration** (memory: `phase_f_split.md`) — deferred to v0.2.0+. See `invoices.md` for the subset that did ship.
- **Supplier ↔ Merchant linking** (memory: `supplier_merchant_linking.md`) — links `invoice_suppliers` to transaction `merchant_names` for auto-matching + substantiation gap detection. Cross-domain w/ Invoices; owner TBD.

## Gaps / rough edges

- `/financials/duplicates` linked from home but disabled — either build or remove the NavCard
- `recovery/financials-merge` is inherently cross-domain (financials + tasks + scan) — grandfathered under the single-domain rule; don't retroactively split

## Related memory

- `financials_v4_requirements.md`, `requirements_v4_decisions.md`, `persist_filter_selections.md`, `taxonomy_simplification_deferred.md`, `phase_f_split.md`
