# Boctor Family Hub — Financial Module v4

**Version:** 4.0
**Date:** April 2026
**Supersedes:** `financial-hub-requirements_3.md` (v3 kept for history)
**Source:** User's Notion pages — Tax Prep Feature Design, Categorisation Guidelines, Annual Rhythm

---

## 1. Core Principles

These principles sit above the category taxonomy and govern how transactions are classified and reported.

| # | Principle | Meaning |
|---|-----------|---------|
| **P1** | Tax follows economic reality, not cash movement | The ATO taxes income when earned and allows deductions when expenses are incurred. A credit card payment from a transaction account is NOT an expense — the expense happened at the swipe. |
| **P2** | Every transaction belongs to exactly one entity | Money between entities (Personal / D3 / Babyccino / Trust) is transfer or loan, never income/expense. |
| **P3** | GST is not your money | For business entities, always think and report in ex-GST amounts. GST component is a liability to the ATO. |
| **P4** | Source determines deductibility, not amount | A $10 coffee can be deductible; a $5,000 holiday cannot. Purpose and nexus to income-earning activity matter, not size. |
| **P5** | If you can't explain it, flag it | Never guess. Use `needs_review` with a note. Accountant prefers 20 flagged items over 200 silent wrong calls. |
| **P6** | Consistency over perfection | Pick allocations (e.g. 40% phone) at FY start, apply all year. Mid-year changes are a red flag. |

---

## 2. The Transfer & Loan Framework

### The Golden Rule
**If money moves between two accounts you own, it is a TRANSFER — never income, never expense.**

### Decision Tree

```
Is money leaving or entering an account?
│
├── Entering
│   ├── From your own other account → TRANSFER IN (ignore for tax)
│   ├── From your company           → TRANSFER IN or LOAN FROM COMPANY (flag)
│   ├── From employer               → INCOME
│   ├── From a client               → INCOME (business)
│   └── From government (CCS, refund)→ INCOME or LIABILITY (depends)
│
└── Leaving
    ├── To your own other account   → TRANSFER OUT (ignore)
    ├── To credit card              → TRANSFER OUT (expense was at swipe)
    ├── To your company             → TRANSFER OUT or LOAN TO COMPANY (flag)
    ├── To a supplier               → EXPENSE (categorise)
    └── Loan repayment              → TRANSFER (principal) + EXPENSE (interest only)
```

### Key Scenarios

| Scenario | Treatment |
|----------|-----------|
| Transaction account → Credit card | **TRANSFER** (ignore, expense was at swipe) |
| Transaction → Offset / Savings | **TRANSFER** (ignore, same economic unit) |
| Credit card balance payment | **TRANSFER** (already expensed) |
| Refund back to card | **REVERSE** original expense |
| Loan principal repayment | **TRANSFER** (liability reduction) |
| Loan interest payment | **EXPENSE** (deductible if investment loan) |
| You pay business expense from personal a/c | **LOAN TO COMPANY** (you're owed this back) |
| Company pays your personal expense | **LOAN FROM COMPANY** (Div 7A risk if not repaid) |
| Director salary | **INCOME** (personal) + **EXPENSE** (company) |
| Franked dividend to you | **INCOME** (personal) |

---

## 3. Entities & Accounts (existing, reconfirmed)

### Entities
- **Personal** — Maged + Mandy household
- **D3** (Data Driven Design Pty Ltd) — consulting company
- **Babyccino** — childcare business
- **Trust** (5M Family Trust) — investment trust

### Rules
- Every financial account maps to exactly one entity.
- Every transaction inherits its entity from its account, unless split.
- Transfers between accounts in the **same entity** exclude from tax reports.
- Transfers between **different entities** are inter-entity loans/wages/dividends.

---

## 4. Schema Extensions (new in v4)

### financial_subcategories
- `ato_code` TEXT nullable — e.g. "D1", "D5", "BE19". Populated later.

### financial_transactions
- `amount_ex_gst` NUMERIC(12,2) nullable — for business entity txns
- `gst_amount` NUMERIC(12,2) nullable
- `gst_applicable` BOOLEAN default false
- `transfer_pair_id` UUID nullable — links matching transfer pairs

### transaction_splits (NEW — schema only, UI deferred)
```
id UUID PK
transaction_id UUID FK → financial_transactions
category_id UUID FK → financial_categories
subcategory_id UUID FK → financial_subcategories (nullable)
entity_id UUID FK → financial_entities (nullable — inherits from transaction)
amount NUMERIC(12,2)  -- must sum to parent transaction
note TEXT nullable
created_at TIMESTAMP
```

### financial_assumptions (NEW)
```
id UUID PK
fy TEXT NOT NULL  -- e.g. "FY2025"
entity_id UUID FK → financial_entities
assumption_type TEXT NOT NULL  -- wfh_percentage, phone_business_pct, home_office_method, vehicle_method, vehicle_business_pct, etc.
value_numeric NUMERIC nullable
value_text TEXT nullable  -- for enum values (e.g. "fixed_rate_70c" vs "actual_cost")
rationale TEXT  -- WHY this value
approved_by TEXT
approved_date TIMESTAMP
created_at TIMESTAMP
```

### Assumption Types Catalogue (starter set)
- `wfh_hours_per_week` — for fixed-rate 70c/hr method
- `home_office_method` — enum: `fixed_rate_70c` | `actual_cost`
- `home_office_floor_area_pct` — only if method = actual_cost
- `phone_business_pct`
- `internet_business_pct`
- `vehicle_method` — enum: `logbook` | `cents_per_km`
- `vehicle_business_pct` — only if method = logbook
- `utilities_business_pct` — for business entities
- `entertainment_deductible_pct` — typically 50% for meals

---

## 5. Decisions Captured (v4 Q&A)

| # | Question | Decision |
|---|----------|----------|
| 1 | ATO codes on subcategories | Defer population, add DB column now |
| 2 | Transfer auto-detection | Manual trigger button + review queue with confirm/override |
| 3 | Split transactions | Schema now, UI deferred to Phase G |
| 4 | Assumptions register | Simple CRUD page, no wizard yet |
| 5 | GST fields | Yes, auto-calculate (÷1.1) for business entity transactions |
| 6 | Accrual date field | Skip — cash basis for all entities, accept FY boundary inaccuracy |
| 7 | Home page | Card-based; Invoice Scanner external link |
| 8 | Build order | A→B→C→D→E→F→G→H (see below) |
| 9 | Requirements doc | New v4 file, keep v3 as history |

---

## 6. Phased Build Plan

### Phase A — Card-Based Home Page (quick win)
**Goal:** Replace the default home page with a card grid showing all key functions.

**Cards:**
1. Tasks & Inbox → `/tasks`
2. Financials Dashboard → `/financials`
3. Import Statements → `/financials/import`
4. Categorise Merchants → `/financials` (Categorize tab)
5. Accounts & Entities → `/financials` (Accounts tab)
6. Assumptions & Rules → `/financials/assumptions` (placeholder until Phase D)
7. Tax Prep → `/financials` (Tax tab)
8. Invoice Scanner → external URL
9. Vehicle Logbook → placeholder (Phase H)

**Files:** `src/app/(dashboard)/page.tsx` (rewrite), maybe a new `src/components/home/function-card.tsx`

---

### Phase B — Schema Extensions
**Goal:** All new columns and tables needed for v4 features. Run migration.

**Changes:**
- Add `ato_code` to `financial_subcategories`
- Add `amount_ex_gst`, `gst_amount`, `gst_applicable`, `transfer_pair_id` to `financial_transactions`
- Create `transaction_splits` table
- Create `financial_assumptions` table
- Add Drizzle relations for the new tables

---

### Phase C — Transfer Detection (biggest data quality fix)
**Goal:** Identify and tag transfers between your own accounts so they stop polluting spending/tax reports.

**Features:**
- "Detect Transfers" button on Financials page (Accounts tab or dedicated section)
- Matching algorithm:
  - Same absolute amount
  - Transaction date within ±1 day
  - Different accounts
  - Prefer same entity first; flag cross-entity as "inter-entity transfer" separately
- Review queue UI: list of proposed pairs, each with "Confirm" and "Reject" buttons
- Confirmed pairs get matching `transfer_pair_id` and `category = TRANSFER`
- Transfers excluded from spending analytics and tax reports

**APIs:**
- `POST /api/financials/detect-transfers` — runs matching, returns proposals
- `POST /api/financials/confirm-transfer` — marks a pair as confirmed

---

### Phase D — Assumptions CRUD
**Goal:** First-class records for WFH%, phone%, vehicle%, etc.

**Features:**
- New page `/financials/assumptions`
- List assumptions grouped by FY
- Add/edit/delete with form: FY, entity, type, value, rationale, approved by
- "Copy from previous FY" button to carry forward
- No wizard (deferred)

**APIs:**
- `GET/POST/PATCH/DELETE /api/financials/assumptions[/id]`

---

### Phase E — GST Auto-Calculation
**Goal:** Business transactions show ex-GST amounts automatically.

**Logic (during ingest):**
- If transaction's account belongs to a business entity (D3, Babyccino) AND it's an expense → calculate `amount_ex_gst = amount / 1.1`, `gst_amount = amount - amount_ex_gst`, `gst_applicable = true`
- Personal entity transactions → leave fields null
- Spending/tax reports for business entities show `amount_ex_gst` instead of gross

---

### Phase F — Tax Prep / Accountant Pack
**Goal:** One-click export bundle for the accountant.

**Features:**
- Populate ATO codes on subcategories (manual mapping UI)
- Per-entity, per-FY report:
  - Income summary
  - Expense summary grouped by ATO code
  - Assumptions register snapshot
  - GST summary (for business entities)
  - Outstanding items checklist
- Export as CSV per table + single-PDF cover sheet, or ZIP bundle

---

### Phase G — Split Transactions UI (schema exists from Phase B)
**Goal:** Let users split a single transaction across multiple categories/entities.

**Features:**
- "Split" button on transaction detail
- Dialog to add/remove split rows, amounts must sum to parent
- Reports use splits when present, otherwise the single row

---

### Phase H — Vehicle Logbook
**Goal:** 12-week trip log + % calculation for tax reports.

**Features:**
- `/financials/vehicles` page
- Add vehicle (linked to entity)
- Trip logger: date, from, to, purpose, km, business/personal flag
- Auto-calculate logbook % over 12-week period
- Link to `vehicle_business_pct` assumption
- Use in tax reports when method = logbook

---

## 7. Annual Rhythm (from Notion)

Calendar reminders to build into the hub:

| When | Action |
|------|--------|
| **1 July** | Set FY assumptions (WFH%, phone%, vehicle%, home office method) |
| **Monthly** | Clear review queue, reconcile business accounts |
| **31 March** | Run draft tax reports — spot gaps before accountant deadline |
| **30 April** | Send accountant pack (invoices, reports, assumptions register) |
| **31 May** | Respond to accountant queries with flagged items resolved |
| **31 October** | Lodgement deadline (with tax agent) |

---

## 8. Roles

| Role | Who | Responsibilities | App Feature |
|------|-----|------------------|-------------|
| **Transaction Recorder** | App (auto) | Capture every txn with date/amount/account | Gmail scanner + Drive import |
| **Categoriser** | Claude AI + Mandy | Assign entity + category to each txn | AI-suggested + confirm/override UI |
| **Assumption Owner** | Maged | Set % allocations at FY start | Assumptions register |
| **Reviewer** | Maged | Clear needs_review queue weekly | Review dashboard |
| **Report Generator** | App (auto) | Produce accountant-ready outputs | One-click report pack |
| **Accountant** | External | Lodgement, compliance, advice | Read-only PDF/ZIP pack |

---

## 9. Design Principles

1. **One source of truth per entity** — every row tagged with entity, no mixing
2. **Assumptions are first-class records** — dedicated table, dated, with rationale
3. **Tax year aware** — everything filtered by Australian FY (Jul–Jun)
4. **Accountant export mode** — read-only, self-contained, consumable without login
5. **Transfer detection auto-excludes** from tax/spending reports
6. **Consistency lock** — changing an assumption mid-FY requires a comment (audit trail)

---

## 10. Open Questions for Later

- ATO code mapping: use D-codes only or also add business-specific schedule codes?
- PAYG statement / payroll tracking for personal income?
- CGT event tracking for investments?
- PHI statement import for private health rebate tier?
- How to handle partial-year entity setup (e.g. new company formed mid-FY)?
- Division 7A loan account tracking — separate feature or part of entities tab?

---

*End of v4 requirements.*
