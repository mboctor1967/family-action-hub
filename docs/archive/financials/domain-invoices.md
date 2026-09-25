# Invoices

Gmail-based invoice/receipt scanner — extracts supplier invoices as attachments or parsed text, exports to Excel/CSV/ZIP for accountant substantiation. Sub-domain of Financials but owns its own surface.

**Path ownership:** `src/app/(dashboard)/financials/invoices/*`, `src/app/api/financials/invoices/*`, `src/components/financials/invoices/*`

## Shipped

- **v0.1.3 — Invoice Reader integration** (memory: `invoice_reader_integration.md`) — ported standalone app into hub at `/financials/invoices`, Gmail query-based search (no labels needed), 4 suppliers seeded from standalone config
- Subsequent iterations during v0.1.3 cycle:
  - Calibration pass — all supplier rules tuned (`b0e7ef6`)
  - Collapsible supplier groups + extraction fixes + HTML preview (`d90efe8`)
  - Date range filter + skip-transactional filter + Microsoft supplier (`05c6608`)
  - Excel + CSV export + Apple Services supplier (`3995c30`)
  - Invoice detail view + CSV/ZIP export + scan-all button (`0aa7430`)
  - Scan-all-for-FY + Good Guys sender emails (`015b3de`)
  - Edit UI for invoice suppliers + seed script (`e6fa499`)

## In-flight

- None.

## Queued (next)

1. **Supplier ↔ Merchant linking** (memory: `supplier_merchant_linking.md`) — connect `invoice_suppliers` rows to transaction `merchant_names` so each imported transaction automatically shows whether it has a substantiating invoice. Enables "missing invoices" report for tax time.
2. **Phase F2 full scanner integration** (memory: `phase_f_split.md`) — complete the originally-planned scanner integration (deferred when F1 tax prep shipped the Drive-folder subset). Scope still to spec.

## Deferred

- None explicitly.

## Gaps / rough edges

- Supplier scanner is manual-trigger only (no cron / automatic refresh). Daily/weekly scans are a natural v2 add-on.
- No test coverage on invoice extraction rules — regression risk as suppliers evolve email templates.

## Related memory

- `invoice_reader_integration.md`, `supplier_merchant_linking.md`, `phase_f_split.md`
