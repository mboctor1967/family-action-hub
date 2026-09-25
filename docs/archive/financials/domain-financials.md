# Financials

Core personal/business financial tracking — accounts, transactions, categorization, coverage, spending analysis, tax prep. Excludes the Invoices sub-domain (see `invoices.md`).

**Path ownership:** `src/app/(dashboard)/financials/*` (excl. `/invoices`), `src/app/api/financials/*` (excl. `/invoices`), `src/components/financials/*`, `src/lib/financials/*`

## Shipped

- **v0.2.0** (2026-04-18) — **Recovery merge** — ships the stranded `feat/financials-fingerprint-dedupe` work: transaction fingerprinting (content-hash dedup per account), QIF import, bank codes, spending trend chart, coverage tab with FY grouping + per-account rows + statement detail, account filter + categorize/import UI polish. Cross-domain (financials + tasks + scan — grandfathered before the single-domain rule). Merge commit `14ed3c8`, release `762a373`.
- **v0.1.2 — Phase F1 Tax Prep** — `/financials/tax` tabbed view, entity-subfoldered ZIP export, rule-based ATO proposer, optional Claude AI enhancement, AI cost panel
- **v0.1.1** — UI refresh (nav bars removed, NavCards compacted)
- Pages live: `/financials`, `/accounts`, `/assumptions`, `/categories`, `/categorize`, `/coverage`, `/import`, `/spending`, `/subscriptions`, `/tax`, `/transfers`
- APIs live: accounts, assumptions, ato-codes, auto-categorize, categories, counts, coverage, entities, export, ingest, merchants, preview, reset, scan, spending, statements, subcategories, subscriptions, summary, tax, transactions, transfers

## In-flight

- None.

## Queued (next)

1. **Taxonomy simplification** (memory: `taxonomy_simplification_deferred.md`) — replace legacy mixed taxonomy + dual ATO columns with two ATO-aligned trees (Personal + Business). Unblocked now that v0.2.0 data exists for validation.
2. **Persist filter selections** (memory: `persist_filter_selections.md`) — remember filters on Spending (and other filter-heavy pages) across reloads. localStorage first, DB later.
3. **Enable `/financials/duplicates`** — NavCard exists on home as "Coming soon"; route not built.
4. **Server-compute Category Manager stats** — home card currently shows hardcoded values (see home `page.tsx` around the Category Manager NavCard).

## Deferred

- **Phase F2 — Invoice scanner full integration** (memory: `phase_f_split.md`) — deferred to v0.2.0+. See `invoices.md` for the subset that did ship.
- **Supplier ↔ Merchant linking** (memory: `supplier_merchant_linking.md`) — links `invoice_suppliers` to transaction `merchant_names` for auto-matching + substantiation gap detection. Cross-domain w/ Invoices; owner TBD.

## Gaps / rough edges

- `/financials/duplicates` linked from home but disabled — either build or remove the NavCard

## Related memory

- `financials_v4_requirements.md`, `requirements_v4_decisions.md`, `persist_filter_selections.md`, `taxonomy_simplification_deferred.md`, `phase_f_split.md`
