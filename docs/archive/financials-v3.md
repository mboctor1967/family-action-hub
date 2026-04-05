# Boctor Family Hub — Financial Statements Tab
## Requirements & Claude Code Prompt

---

## 1. FEATURE OVERVIEW

Add a **"Financials"** tab to the Boctor Family Hub Next.js app that:
- Scans a user-selected folder of bank statement PDFs
- Detects and skips duplicate files
- Parses PDFs into structured transaction records stored in Supabase
- Provides an analytics dashboard for spending analysis, subscription detection, coverage gaps, and tax preparation

---

## 2. FUNCTIONAL REQUIREMENTS

### 2.1 File Ingestion

| # | Requirement |
|---|-------------|
| F1 | User can select or configure a folder path (stored in app settings / `.env.local`) pointing to bank statement PDFs |
| F2 | On scan, the app recursively enumerates all `.pdf` files in that folder |
| F3 | Each file is hashed (SHA-256) on first read; hash stored in Supabase `statement_files` table |
| F4 | If a hash already exists → mark as **duplicate**, skip processing, log it |
| F5 | Content-level duplicate check: if a statement with the same bank + account number + statement period already exists → also skip, even if filename differs |
| F6 | A scan summary is shown before committing: "X new, Y duplicates, Z already imported" |
| F7 | User confirms before ingestion begins |

### 2.2 PDF Parsing

| # | Requirement |
|---|-------------|
| P1 | Use `pdf-parse` (Node.js) or `pdfplumber` (Python microservice) to extract raw text from each PDF |
| P2 | Use Claude API (claude-sonnet-4) to extract structured data from the raw text — see schema below |
| P3 | Extracted fields per statement: bank name, account name, account number (last 4 digits), BSB, statement period (start date, end date), opening balance, closing balance, currency |
| P4 | Extracted fields per transaction: date, description (raw), amount, debit/credit flag, running balance, merchant name (AI-inferred), category (AI-inferred) |
| P5 | If Claude cannot confidently parse a field, flag it as `needs_review: true` |
| P6 | Parsing errors logged to a `parse_errors` table with the file path and error message |
| P7 | Support for at minimum: ANZ, CommBank, Westpac, NAB statement formats (heuristic detection based on PDF header) |

### 2.3 Database Schema (Supabase)

```sql
-- Accounts (one row per unique bank account)
CREATE TABLE financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT NOT NULL,
  account_name TEXT,
  account_number_last4 TEXT,
  bsb TEXT,
  account_type TEXT, -- 'personal_cheque' | 'personal_savings' | 'business_cheque' | 'credit_card'
  owner TEXT, -- 'maged' | 'family' | 'business'
  currency TEXT DEFAULT 'AUD',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Statement metadata (one row per statement PDF)
CREATE TABLE financial_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES financial_accounts(id),
  file_path TEXT,
  file_hash TEXT UNIQUE,
  bank_name TEXT,
  statement_start DATE,
  statement_end DATE,
  opening_balance NUMERIC(12,2),
  closing_balance NUMERIC(12,2),
  is_duplicate BOOLEAN DEFAULT false,
  needs_review BOOLEAN DEFAULT false,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions (one row per line item)
CREATE TABLE financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID REFERENCES financial_statements(id),
  account_id UUID REFERENCES financial_accounts(id),
  transaction_date DATE NOT NULL,
  description_raw TEXT,
  merchant_name TEXT,
  amount NUMERIC(12,2) NOT NULL, -- negative = debit
  is_debit BOOLEAN,
  running_balance NUMERIC(12,2),
  category TEXT, -- see Category Taxonomy below
  subcategory TEXT,
  is_subscription BOOLEAN DEFAULT false,
  subscription_frequency TEXT, -- 'monthly' | 'annual' | 'weekly'
  is_tax_deductible BOOLEAN,
  tax_category TEXT, -- 'work_expense' | 'investment' | 'donation' | null
  needs_review BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Parse errors log
CREATE TABLE parse_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.4 Category Taxonomy

```
INCOME
  - Salary / Payroll
  - Freelance / Consulting
  - Investment Returns
  - Government Benefits
  - Other Income

HOUSING
  - Mortgage / Rent
  - Strata / Body Corporate
  - Utilities (Electricity, Gas, Water)
  - Home Insurance
  - Maintenance & Repairs

TRANSPORT
  - Tesla / EV Charging
  - Fuel
  - Rego & Insurance
  - Tolls & Parking
  - Public Transport
  - Uber / Rideshare

GROCERIES & DINING
  - Supermarket
  - Dining Out / Takeaway
  - Cafes & Coffee

HEALTH
  - Medical / GP / Specialist
  - Pharmacy
  - Health Insurance
  - Gym & Fitness

EDUCATION & CHILDCARE
  - School Fees
  - Childcare
  - Courses & Books

SUBSCRIPTIONS & DIGITAL
  - Streaming (Netflix, Stan, Disney+, etc.)
  - Software & SaaS
  - Cloud Services (AWS, Vercel, Supabase, etc.)
  - Telco (Mobile, Internet)
  - News & Media

FINANCIAL
  - Bank Fees
  - Credit Card Payments
  - Loan Repayments
  - Super / Investment Contributions
  - Insurance (Life, Income Protection)

BUSINESS EXPENSES
  - Contractors & Services
  - Equipment & Technology
  - Professional Services (Accountant, Lawyer)
  - Marketing & Advertising
  - Travel & Accommodation

SHOPPING & LIFESTYLE
  - Clothing & Apparel
  - Electronics & Tech
  - Home & Garden
  - Sports & Recreation
  - Gifts & Donations

TRANSFERS
  - Internal Transfer
  - Family Transfer

OTHER / UNCATEGORISED
```

### 2.5 Analytics Dashboard

#### Tab 1 — Overview
- Monthly income vs expenses bar chart (last 12 months)
- Net savings rate trend line
- Account balance summary cards (per account, latest closing balance)
- Coverage status: calendar heatmap showing which months have statements vs gaps

#### Tab 2 — Spending Breakdown
- Donut chart: spending by top-level category (current month / selectable period)
- Drill-down: click category → see subcategory breakdown + individual transactions
- Month-over-month comparison table
- Biggest single transactions (top 10, selectable period)

#### Tab 3 — Subscriptions
- Auto-detected recurring charges table: merchant, amount, frequency, estimated annual cost
- Total subscription spend per month
- Highlight subscriptions not used recently (> 60 days since last charge anomaly)
- Flag potential duplicate subscriptions (same merchant, two accounts)

#### Tab 4 — Coverage & Gaps
- Visual timeline per account showing which months are covered
- Red = missing statement, Green = imported, Yellow = needs review
- List of missing periods with "Expected next statement date"
- Filter by bank / account type / owner

#### Tab 5 — Tax Preparation (FY Summary)
- Financial year selector (Jul–Jun)
- Work-related expense total (flagged `is_tax_deductible`)
- Donations & charitable giving total
- Investment income / managed fund distributions
- Home office / work-from-home expenses
- Downloadable CSV export: all tax-relevant transactions
- Summary card: "Estimated deductible expenses this FY: $X,XXX"

---

## 3. NON-FUNCTIONAL REQUIREMENTS

| # | Requirement |
|---|-------------|
| NF1 | PDF scanning runs server-side (Next.js API route or server action) — PDFs never leave the local machine |
| NF2 | Claude API calls are batched: max 5 concurrent, with retry on rate limit |
| NF3 | Progress shown during ingestion: file-by-file status with % complete |
| NF4 | All monetary values stored as NUMERIC(12,2) — no floating point |
| NF5 | Transactions deduped at DB level via unique constraint on (account_id, transaction_date, amount, description_raw) |
| NF6 | Date handling: all dates stored as DATE (no time), Australia/Sydney timezone assumed |
| NF7 | App must handle 500+ PDFs and 50,000+ transactions without UI lag (use pagination + aggregation queries) |

---

## 4. TECH STACK

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React, Tailwind CSS, shadcn/ui |
| Charts | Recharts or Tremor |
| Backend | Next.js API routes / Server Actions |
| Database | Neon (serverless Postgres) |
| ORM / Query | Drizzle ORM + `@neondatabase/serverless` driver |
| PDF Parsing | `pdf-parse` npm package |
| AI Extraction | Anthropic Claude API (claude-sonnet-4) |
| File System Access | Node.js `fs` module (server-side only) |
| Auth | Existing app auth |

---

## 5. CLAUDE CODE PROMPT

Copy and paste the following prompt to Claude Code:

---

```
I want to add a "Financials" tab to my existing Boctor Family Hub Next.js 14 app (App Router, Tailwind, shadcn/ui, Neon Postgres). The app lives at [YOUR_PROJECT_PATH].

Please build the complete Financial Statements feature end-to-end. Here is the full specification:

---

### GOAL
A financial hub tab that ingests bank statement PDFs from a local folder, deduplicates them, parses transactions using Claude AI, stores everything in a Neon Postgres database, and provides analytics for spending, subscriptions, coverage gaps, and tax preparation.

---

### STEP 1 — DATABASE SETUP

Install dependencies:
```
npm install @neondatabase/serverless drizzle-orm
npm install -D drizzle-kit
```

Add `DATABASE_URL` to `.env.local` — the Neon connection string from the Neon console (format: `postgresql://user:password@host.neon.tech/dbname?sslmode=require`).

Create a Neon/Drizzle client at `lib/db.ts`:
```ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);
```

Create Drizzle schema at `lib/schema/financials.ts` with these tables:

1. `financial_accounts` — one row per unique bank account
   - id (uuid pk default gen_random_uuid()), bank_name, account_name, account_number_last4, bsb, account_type (text: personal_cheque | personal_savings | business_cheque | credit_card), owner (text: maged | family | business), currency (default AUD), created_at

2. `financial_statements` — one row per PDF statement
   - id (uuid pk), account_id (fk → financial_accounts), file_path, file_hash (unique), statement_start (date), statement_end (date), opening_balance (numeric 12,2), closing_balance (numeric 12,2), is_duplicate (bool default false), needs_review (bool default false), imported_at (timestamp default now())

3. `financial_transactions` — one row per transaction line
   - id (uuid pk), statement_id (fk), account_id (fk), transaction_date (date), description_raw, merchant_name, amount (numeric 12,2 — negative = debit), is_debit (bool), running_balance, category, subcategory, is_subscription (bool default false), subscription_frequency (text), is_tax_deductible (bool default false), tax_category (text), needs_review (bool default false), created_at
   - Add unique constraint on (account_id, transaction_date, amount, description_raw) to prevent transaction duplicates

4. `parse_errors` — id (uuid pk), file_path, error_message, created_at

Generate and run the migration:
```
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

### STEP 2 — FOLDER CONFIGURATION
- Add `FINANCIAL_STATEMENTS_FOLDER` to `.env.local` (the path to the folder containing PDFs)
- Create a settings UI in the Financials tab where the user can view/update this path (stored in a `app_config` Neon table or simply read from `.env.local` via a server action)

---

### STEP 3 — SERVER-SIDE INGESTION API

Create `app/api/financials/scan/route.ts` — POST endpoint that:
1. Reads the configured folder path recursively, finds all `.pdf` files
2. For each PDF, computes SHA-256 hash using Node.js `crypto`
3. Checks `financial_statements` table for existing hash — if found, mark as duplicate and skip
4. Returns a scan summary JSON: `{ total, new_files, duplicates, already_imported, files: [...] }`

Create `app/api/financials/ingest/route.ts` — POST endpoint that:
1. Accepts `{ file_paths: string[] }` — the new files to process
2. For each file:
   a. Extract raw text using `pdf-parse` npm package
   b. Call Claude API (claude-sonnet-4-20250514) with the raw text to extract:
      - Statement metadata: bank_name, account_name, account_number_last4, bsb, account_type, statement_start (YYYY-MM-DD), statement_end (YYYY-MM-DD), opening_balance, closing_balance
      - Array of transactions: transaction_date, description_raw, amount (negative for debits), is_debit, running_balance, merchant_name, category (from taxonomy below), subcategory, is_subscription, subscription_frequency, is_tax_deductible, tax_category
   c. Claude should respond ONLY with valid JSON, no markdown
   d. Upsert account to `financial_accounts` (match on bank_name + account_number_last4)
   e. Insert statement to `financial_statements`
   f. Bulk insert transactions to `financial_transactions` (use ON CONFLICT DO NOTHING for the unique constraint)
3. Stream progress back to client using Server-Sent Events or return batch results
4. Log any errors to `parse_errors` table

Claude AI prompt for extraction (use this system prompt):
"""
You are a bank statement parser. Extract structured data from the following Australian bank statement text. 
Respond ONLY with a valid JSON object — no markdown, no explanation, no backticks.

The JSON must have this exact structure:
{
  "bank_name": string,
  "account_name": string,
  "account_number_last4": string,
  "bsb": string | null,
  "account_type": "personal_cheque" | "personal_savings" | "business_cheque" | "credit_card",
  "statement_start": "YYYY-MM-DD",
  "statement_end": "YYYY-MM-DD",
  "opening_balance": number,
  "closing_balance": number,
  "transactions": [
    {
      "transaction_date": "YYYY-MM-DD",
      "description_raw": string,
      "amount": number,
      "is_debit": boolean,
      "running_balance": number | null,
      "merchant_name": string | null,
      "category": string,
      "subcategory": string | null,
      "is_subscription": boolean,
      "subscription_frequency": "monthly" | "annual" | "weekly" | null,
      "is_tax_deductible": boolean,
      "tax_category": "work_expense" | "investment" | "donation" | null
    }
  ]
}

For amounts: use negative numbers for debits/payments, positive for credits/deposits.

Category must be one of: INCOME, HOUSING, TRANSPORT, GROCERIES & DINING, HEALTH, EDUCATION & CHILDCARE, SUBSCRIPTIONS & DIGITAL, FINANCIAL, BUSINESS EXPENSES, SHOPPING & LIFESTYLE, TRANSFERS, OTHER
"""

---

### STEP 4 — ANALYTICS API ROUTES

Create these query endpoints under `app/api/financials/`:

- `GET /summary?period=YYYY-MM` — monthly income/expense/savings totals
- `GET /spending?from=DATE&to=DATE&account_id=X` — spending by category with amounts
- `GET /subscriptions` — recurring transactions grouped by merchant, with frequency + annual cost
- `GET /coverage` — per-account timeline of which months have statements (for gap detection)
- `GET /tax?fy=2025` — all tax-deductible transactions for a financial year (Jul–Jun), grouped by tax_category

---

### STEP 5 — FINANCIALS TAB UI

Create `app/(dashboard)/financials/page.tsx` with these sub-tabs using shadcn/ui Tabs:

**Tab 1: Overview**
- Stat cards: Total Income, Total Expenses, Net Savings, Savings Rate (current month)
- Bar chart (Recharts): Monthly income vs expenses last 12 months
- Coverage alert banner: "⚠️ X accounts have missing statements" with link to Coverage tab
- Account balance cards: one per account, showing latest closing balance + last statement date

**Tab 2: Spending**
- Date range picker (default: current month)
- Donut chart: spending by category
- Table below: category | amount | % of total | vs last period
- Click a category row → expand to show individual transactions

**Tab 3: Subscriptions**
- Table: Merchant | Account | Amount | Frequency | Est. Annual Cost | Last Charged
- Summary: "You spend $X/month on subscriptions ($Y/year)"
- Flag rows where same merchant appears on multiple accounts (potential duplicates)

**Tab 4: Coverage & Gaps**
- Per-account timeline grid: rows = accounts, columns = months (last 24 months)
- Cell colours: green = statement imported, red = missing, yellow = needs review, grey = future
- List below: "Missing statements" with bank name, account, period, action button "Mark as N/A"

**Tab 5: Tax Prep**
- Financial year selector
- Summary cards: Work Expenses | Donations | Investment Income | Total Deductibles
- Transaction table filtered to `is_tax_deductible = true`
- "Export for Accountant" button → downloads CSV with date, merchant, amount, tax_category, description

**Ingest Panel (slide-over / drawer)**
- "Scan Folder" button → calls /api/financials/scan → shows results summary
- "Import X New Files" confirm button → calls /api/financials/ingest with streaming progress
- Progress bar + per-file status (✓ parsed, ⚠ needs review, ✗ error)
- Duplicate files shown in collapsed section

---

### STEP 6 — MANUAL REVIEW UI

On any transaction where `needs_review = true`:
- Show a yellow flag icon in transaction lists
- Clicking opens an inline edit popover: correct category, merchant name, tax flag
- Save updates the Neon database record via a PATCH API route

---

### ADDITIONAL NOTES
- Install required packages: `pdf-parse`, `@anthropic-ai/sdk`, `@neondatabase/serverless`, `drizzle-orm`, `p-limit`
- Use `ANTHROPIC_API_KEY` from `.env.local`
- Use `DATABASE_URL` (Neon connection string) from `.env.local`
- Use `FINANCIAL_STATEMENTS_FOLDER` from `.env.local` for the folder path
- All PDF reading must happen server-side — never expose file paths to the client
- Use the Drizzle `db` client (not a browser client) in all API routes
- Batch Claude API calls: max 5 concurrent using `p-limit`
- Add a `financials` link to the existing app sidebar/nav
- Match the existing app's design system (Tailwind + shadcn/ui components)
- TypeScript throughout — create types in `types/financials.ts`

Please start with Step 1 (database migration), confirm the schema, then proceed through each step in order. Ask me before proceeding to the next step if you need clarification.
```

---

## 6. IMPLEMENTATION CHECKLIST

Use this to track progress as Claude Code builds each piece:

### Database
- [ ] Drizzle schema created (`lib/schema/financials.ts`)
- [ ] Migration generated and applied to Neon
- [ ] Indexes on transaction_date, account_id, statement_id

### Ingestion
- [ ] Folder scanner API working
- [ ] SHA-256 duplicate detection working
- [ ] Content-level duplicate check (same bank + account + period)
- [ ] `pdf-parse` extracting raw text successfully
- [ ] Claude API extracting structured JSON correctly
- [ ] ANZ format tested
- [ ] CommBank format tested
- [ ] Westpac format tested
- [ ] Transaction deduplication working

### Analytics
- [ ] Summary query working
- [ ] Spending breakdown query working
- [ ] Subscription detection working
- [ ] Coverage gap detection working
- [ ] Tax FY query working

### UI
- [ ] Overview tab rendering
- [ ] Spending tab with drill-down
- [ ] Subscriptions tab
- [ ] Coverage timeline grid
- [ ] Tax Prep tab with CSV export
- [ ] Ingest panel with progress
- [ ] Manual review/edit flow

---

## 7. KNOWN RISKS & MITIGATIONS

| Risk | Mitigation |
|------|------------|
| PDFs are scanned images (no text layer) | Detect empty text extraction → flag for manual OCR; future: add Tesseract OCR step |
| Bank formats vary significantly | Claude AI handles format-agnostic parsing; add bank-specific pre-processing if needed |
| Large transaction volumes slow queries | Add DB indexes; use Supabase RPC for aggregation; paginate transaction tables |
| Claude API cost on 500 PDFs | Estimate ~$0.10–0.30 per statement; ~$50–150 for initial bulk import |
| Sensitive financial data security | PDFs stay local (server-side only); Supabase RLS; never log full account numbers |

---

*Document version: 1.0 — April 2026*
*Project: Boctor Family Hub — Financial Statements Module*
