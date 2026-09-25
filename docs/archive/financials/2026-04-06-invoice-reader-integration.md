---
Feature: Invoice Reader Integration — port standalone app into Family Hub
Date: 2026-04-06
Tier: HIGH
Status: SIGNED OFF
Target release: v0.1.3
App version at last update: v0.1.2
Source app: C:\Users\MagedBoctor\Claude\Invoice Reader\
---

# Invoice Reader Integration

## Goal

Port the standalone Invoice Reader app into the Family Hub as `/financials/invoices`. The standalone app scans Gmail for supplier invoices (Wilson Parking, Good Guys, Evernote, OfficeWork, etc.), extracts invoice data from emails/PDFs, and generates per-supplier PDF bundles + Excel summaries. Once the integrated version is tested and stable, the standalone project gets deleted from local, GitHub, and Vercel.

## What the standalone app does today

### Pipeline

```
Gmail (via IMAP + app password)
  → search by label (e.g. "Wilson 2024-25")
  → download emails matching supplier keywords
  → for each email:
      → extract text from HTML body + PDF attachments
      → regex-parse: invoice number, date, amount, GST, supplier, location, service type
      → save PDF (from attachment, or render HTML→PDF via Puppeteer)
  → generate Excel summary (Transactions + Summary + Invoices Only sheets)
  → ZIP all PDFs
  → output to local filesystem per-supplier folder
```

### Fields extracted per invoice

| Field | Source |
|---|---|
| invoiceNumber | Email subject regex or body regex |
| invoiceDate / purchaseDate | Body: "Purchased DD Mon YYYY", "Invoice date: DD/MM/YYYY" |
| serviceDate | Body: actual service date (e.g. parking date) |
| referenceNumber | Body: "Reference number XXXX" |
| location | Body: venue/car park name |
| serviceType | Body: "Flexi Saver", "Daily Pass Bundle", etc. |
| totalAmount | Body: multiple regex patterns for "$X.XX", "Total including GST" |
| gst | Body: "GST: $X.XX", "Incl. $X.XX GST" |
| subTotal | Body: "Sub-total: $X.XX" |
| emailType | Classification: Invoice / Receipt / Payment Confirmation / Other |
| pdfFile | Saved PDF (from attachment or rendered from HTML) |

### Suppliers currently configured

| Supplier | Gmail Label | Entity |
|---|---|---|
| Wilson Parking | Wilson 2024-25 | D3 Pty Ltd (business expense — parking) |
| Good Guys Mobile | GoodGuys 2024-25 | D3 Pty Ltd or Personal |
| Evernote | Evernote 2024-25 | D3 Pty Ltd (SaaS) |
| OfficeWork | Officework 2024-25 | D3 Pty Ltd or Personal |

### Current tech stack

| Component | Library | Hub equivalent |
|---|---|---|
| Email access | `imapflow` (IMAP + Gmail app password) | Gmail API via existing OAuth (`googleapis`) |
| Email parsing | `mailparser` | Gmail API returns structured data natively |
| PDF text extraction | `pdf-parse` | Already in hub (`pdf-parse` in package.json) |
| HTML → PDF rendering | `puppeteer` (200MB, no Vercel) | `@react-pdf/renderer` (already installed) |
| Excel generation | `exceljs` | `papaparse` CSV (already installed) |
| ZIP bundling | `archiver` | `jszip` (already installed) |
| Web UI | Express + inline HTML | Next.js page (already the hub pattern) |
| Data storage | Local filesystem | Neon DB + Vercel Blob |
| Auth | Gmail app password (hardcoded) | Google OAuth (already in hub) |

## Migration approach — Hybrid (Approach C)

### What we PORT (valuable logic, ~500 lines)

- `extractWilsonData()` → rename to `extractInvoiceFields()` — the core regex extraction for invoice number, dates, amounts, GST, supplier, location, service type. Despite the name, it handles all suppliers via generic patterns.
- `findKeywordMatch()` — supplier keyword matching against email subject, body, attachment filenames, attachment PDF content
- `isTransactionalEmail()` — filter marketing vs transactional emails
- `parseDateStr()` — robust AU date parsing (DD/MM/YYYY, "27th May 2025", "10 June 2025")
- `htmlToText()` — HTML tag stripping for email body parsing
- Field extraction regex patterns (amount, GST, subtotal, invoice number, reference number, location, service type)

### What we REPLACE (plumbing)

| Old | New | Why |
|---|---|---|
| IMAP + app password | Gmail API via existing OAuth | Already authenticated in hub; no separate credentials |
| Puppeteer HTML→PDF | `@react-pdf/renderer` for summaries; store original email HTML/PDF as-is | Puppeteer is 200MB and can't run on Vercel |
| Express web UI | `/financials/invoices` Next.js page | Matches hub patterns |
| Local FS output | Neon DB (metadata) + Vercel Blob (PDFs) | Scalable, cloud-native |
| `exceljs` | `papaparse` CSV + existing PDF report templates | Already installed |
| `archiver` | `jszip` | Already installed |

### What we ADD (new features the standalone didn't have)

1. **Entity linking** — each supplier maps to an entity (D3 Pty Ltd, Personal, Babyccino)
2. **ATO code tagging** — each invoice gets an ATO code (6-OTHER-SUBS for Evernote, 6-MV for Wilson Parking, etc.)
3. **Transaction matching** — link each invoice to a `financial_transactions` row by amount + date proximity
4. **Tax export integration** — Phase F1's tax export reads from `invoices` table instead of Drive folder scan (the F1↔F2 contract)
5. **FY awareness** — supplier configs scoped by FY, matching the hub's FY model
6. **Scan history** — track which emails have been processed (dedup across runs)

## Schema

### `invoice_suppliers` — supplier configuration (replaces `suppliers.js`)

```sql
invoice_suppliers (
  id uuid PK,
  entity_id uuid FK → financial_entities,
  name text NOT NULL,                     -- "Wilson Parking"
  gmail_label text,                       -- "Wilson 2024-25"
  keywords jsonb NOT NULL DEFAULT '[]',   -- ["invoice", "receipt", "parking"]
  fy text NOT NULL,                       -- "FY2024-25"
  default_ato_code text,                  -- "6-MV" for parking, "6-OTHER-SUBS" for Evernote
  is_active boolean DEFAULT true,
  last_scanned_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
)
```

### `invoices` — extracted invoice records (replaces local FS output)

```sql
invoices (
  id uuid PK,
  supplier_id uuid FK → invoice_suppliers,
  entity_id uuid FK → financial_entities,
  fy text NOT NULL,

  -- extracted fields (from email parsing)
  invoice_number text,
  invoice_date date,
  purchase_date date,
  service_date text,                      -- may be a range like "27 Jun - 26 Jul 2025"
  reference_number text,
  supplier_name text,                     -- "Wilson Parking" (from email, may differ from supplier.name)
  location text,                          -- "Sydney Opera House"
  service_type text,                      -- "Flexi Saver", "Daily Pass Bundle"
  description text,                       -- email subject
  email_type text,                        -- "Invoice" | "Receipt" | "Payment Confirmation"

  -- financials
  sub_total numeric(12,2),
  gst_amount numeric(12,2),
  total_amount numeric(12,2),

  -- storage
  pdf_blob_url text,                      -- Vercel Blob URL for the saved PDF
  source_email_id text UNIQUE,            -- Gmail message ID (for dedup across runs)
  source_email_date timestamp,
  source_from text,                       -- email sender

  -- linking
  ato_code text,                          -- inherited from supplier.default_ato_code, overridable
  linked_txn_id uuid FK → financial_transactions,  -- matched transaction
  status text DEFAULT 'extracted',        -- 'extracted' | 'verified' | 'linked' | 'excluded'

  -- meta
  raw_text text,                          -- full extracted text (for re-parsing / debugging)
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
)
```

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/financials/invoices/suppliers` | GET | List all supplier configs |
| `/api/financials/invoices/suppliers` | POST | Create a new supplier config |
| `/api/financials/invoices/suppliers/[id]` | PATCH/DELETE | Edit/delete a supplier |
| `/api/financials/invoices/scan` | POST | Trigger a scan for a supplier + FY (SSE progress, same pattern as tax export) |
| `/api/financials/invoices` | GET | List invoices (filterable by supplier, FY, entity, status) |
| `/api/financials/invoices/[id]` | GET/PATCH | View/edit an invoice (override ATO code, link to transaction, change status) |
| `/api/financials/invoices/[id]/pdf` | GET | Proxy the PDF from Vercel Blob (auth-gated download) |

## UI pages

### `/financials/invoices` — main page (tabbed, like Tax Prep)

**Tab 1 — Suppliers** (config)
- List of supplier configs: name, entity, Gmail label, keywords, FY, default ATO code, last scanned date
- Add/edit/delete supplier
- "Scan now" button per supplier → triggers SSE-streamed extraction

**Tab 2 — Invoices** (results)
- Table: invoice date, supplier, invoice #, amount, GST, total, ATO code, status, linked txn
- Filters: supplier, FY, entity, status
- Click row → detail panel with PDF preview + edit fields + transaction picker

**Tab 3 — Scan History**
- Log of scan runs: supplier, FY, date, emails found, invoices extracted, errors

### Home page NavCard (under Ingest)
- Currently disabled + "External" badge → enable, remove badge, link to `/financials/invoices`
- Stats: `{ label: 'Suppliers', value: N }, { label: 'Invoices (FY)', value: N }`

## Implementation waves

### Wave 0 — Schema + deps (~1 hour)
- [ ] T-00 — Drizzle migration: `invoice_suppliers` + `invoices` tables + indexes
- [ ] T-01 — TypeScript types for Invoice, InvoiceSupplier, ScanProgress
- [ ] T-02 — Gmail API helper: `searchEmails(label, dateRange)` + `getEmailContent(messageId)` using existing OAuth tokens (extends `src/lib/gdrive/` or new `src/lib/gmail/`)

### Wave 1 — Core extraction logic (~2-3 hours, parallel)
- [ ] T-10 — Port `extractInvoiceFields()` from `invoice_extractor.js` lines 174-270 → `src/lib/financials/invoice-parser.ts` (TypeScript, same regexes)
- [ ] T-11 — Port `findKeywordMatch()` + `isTransactionalEmail()` + `parseDateStr()` + `htmlToText()` → same file or `src/lib/financials/invoice-utils.ts`
- [ ] T-12 — Invoice scan orchestrator: `scanSupplierInvoices(supplierId, fy)` — connects pipeline: Gmail search → download → parse → extract → save to DB + Blob
- [ ] T-13 — Tests for T-10/T-11: unit tests with sample email text fixtures from the existing `output/` folder

### Wave 2 — API routes (~2 hours, parallel)
- [ ] T-20 — Supplier CRUD routes (GET/POST/PATCH/DELETE)
- [ ] T-21 — Scan trigger route with SSE progress (POST /scan → SSE stream, same pattern as tax export)
- [ ] T-22 — Invoice list/detail/edit routes (GET/PATCH)
- [ ] T-23 — Invoice PDF proxy route (auth-gated Blob download)

### Wave 3 — UI (~2-3 hours, mixed)
- [ ] T-30 — `/financials/invoices` page shell + 3 tabs
- [ ] T-31 — Suppliers tab: CRUD table + "Scan now" button
- [ ] T-32 — Invoices tab: filterable table + detail drawer with PDF preview
- [ ] T-33 — Scan History tab
- [ ] T-34 — Home page NavCard update: enable, remove "External" badge, add live stats

### Wave 4 — Tax export integration + cleanup (~1 hour)
- [ ] T-40 — Update tax export bundler: if `invoices` table has rows for an entity+FY, read from DB instead of Drive scan. Fall back to Drive scan if no rows (backward compat with F1).
- [ ] T-41 — Update `invoices-index.csv` generation to pull from DB rows
- [ ] T-42 — CHANGELOG + feature brief update

## Migration plan — standalone → integrated

| Phase | What | When |
|---|---|---|
| **1. Build** | Implement all waves above inside Family Hub | Next 1-2 sessions |
| **2. Seed suppliers** | Create `invoice_suppliers` rows for Wilson Parking, Good Guys, Evernote, OfficeWork — matching the existing `suppliers.js` config | During Wave 0 |
| **3. Test scan** | Run a scan for Wilson Parking FY2024-25 via the hub's `/financials/invoices` page. Compare output against the standalone app's `output/Wilson_Parking/` folder. Verify: same invoice count, same amounts, same PDFs. | After Wave 3 |
| **4. Cross-validate** | For each supplier: run both the standalone app AND the hub scanner, diff the results. Fix any parsing discrepancies. | After step 3 |
| **5. Tax export test** | Generate accountant pack via `/financials/tax` → Export tab. Verify the invoices come from the DB (not Drive scan) and the `invoices-index.csv` has the right data. | After Wave 4 |
| **6. Parallel run** | Keep both systems running for 1-2 weeks. Use the hub for daily work; standalone as a safety net. | After step 5 |
| **7. Decommission** | Once confident: (a) delete `C:\Users\MagedBoctor\Claude\Invoice Reader\` locally, (b) archive/delete the GitHub repo, (c) delete the Vercel deployment if it has one. | User's call, no rush |

## Key risks

| Risk | Mitigation |
|---|---|
| Gmail API returns different email structure than IMAP | Test with the same mailbox; Gmail API returns full MIME, `mailparser`-compatible. Extraction regexes work on text content regardless of transport. |
| No Puppeteer on Vercel (can't render HTML emails to PDF) | For emails without PDF attachments: store the raw HTML in the `invoices.raw_text` column. If a PDF is needed, render client-side via `@react-pdf/renderer` or accept the HTML as the source doc. Most invoice emails have PDF attachments anyway. |
| Gmail API rate limits (250 quota units per user per second) | Throttle scan to 5 emails/sec. A typical supplier has 50-200 emails per FY — takes < 1 minute even throttled. |
| Regex parsing fails on a new supplier's email format | The extraction function uses generic patterns that work across all 4 current suppliers. New suppliers may need new patterns — add them to `extractInvoiceFields()` as discovered. The `raw_text` column preserves the source for debugging. |
| Vercel Blob storage cost for many PDFs | Each PDF is ~50-200KB. 200 invoices × 150KB = ~30MB per FY. Vercel Blob free tier is 500MB. Well within limits for years. |

## Security notes

- **Gmail app password (`bqaunflahnvramkv` in `suppliers.js`) is NOT migrated.** The hub uses Google OAuth — no app passwords needed. The user's existing OAuth token (used for Drive scan + email scan in the Tasks module) covers Gmail read access.
- **No new secrets needed.** The `BLOB_READ_WRITE_TOKEN` is already set from Phase F1.
- **Email content is stored in DB** (`raw_text` column) — not publicly accessible; admin-gated API only.

## Acceptance criteria

- AC-001 [MUST] — Supplier CRUD works: create/edit/delete supplier configs with entity, Gmail label, keywords, FY, default ATO code
- AC-002 [MUST] — "Scan now" for a supplier: connects to Gmail via OAuth, searches by label, downloads + parses emails, extracts fields, saves to `invoices` table + PDF to Blob
- AC-003 [MUST] — Extracted invoice data matches standalone app output for the same supplier + FY (verified via cross-validation in migration step 4)
- AC-004 [MUST] — Invoice list page shows all invoices with filters (supplier, FY, entity, status)
- AC-005 [MUST] — Invoice detail shows PDF preview + editable fields (ATO code, linked txn, status)
- AC-006 [MUST] — Tax export bundler reads from `invoices` table when available, falls back to Drive scan when not
- AC-007 [MUST] — Dedup: re-scanning the same FY doesn't create duplicate invoice rows (keyed by `source_email_id`)
- AC-008 [MUST] — Admin-only access on all routes (403 for non-admin)
- AC-009 [SHOULD] — Transaction auto-matching: after scan, suggest links to `financial_transactions` by amount + date proximity
- AC-010 [SHOULD] — Scan history tab showing past runs with counts + errors
- AC-011 [SHOULD] — Home page NavCard enabled with live stats

## Out of scope

- Automated/scheduled scanning (cron job) — manual "Scan now" button only for v0.1.3
- Multi-account Gmail (only Maged's account for now)
- OCR for scanned/image-based PDF invoices (text extraction via `pdf-parse` only)
- Invoice approval workflow (status field exists but no multi-user review flow)
