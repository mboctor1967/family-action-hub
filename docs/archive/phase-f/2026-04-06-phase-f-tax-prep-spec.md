---
Doc version: v0.1
Last updated: 2026-04-06
Status: SIGNED OFF
App version at last update: v0.1.1
Requirements: docs/requirements/2026-04-06-phase-f-tax-prep.md (v0.2)
Design: docs/specs/2026-04-06-phase-f-tax-prep-design.md
Tier: 1 — HIGH
---

# Technical Spec — Phase F1: Tax Prep / Accountant Pack

## Technical Decisions Log

| # | Decision | Chosen | Date |
|---|---|---|---|
| TD-1 | ATO reference data storage | **B** — DB table with seed migration; constants file in ato-codes.ts as build-time source of truth | 2026-04-06 |
| TD-2 | CSV library | **A** — `papaparse` | 2026-04-06 |
| TD-3 | ZIP library | **A** — `jszip` | 2026-04-06 |
| TD-4 | App-level settings storage | **A** — new `app_settings` key-value table | 2026-04-06 |
| TD-5 | Invoice tags storage | **A** — new `invoice_tags` table keyed by `gdrive_file_id` | 2026-04-06 |
| TD-6 | Export jobs + temp ZIP storage | **A** — `export_jobs` table + Vercel Blob, 1-hour expiry | 2026-04-06 |
| TD-7 | Rule-based ATO lookup algorithm | Approved as specified (see §Algorithms) | 2026-04-06 |
| TD-8 | Drive folder scan scope | **A** — shallow, files only, fixed MIME filter, 500-file cap | 2026-04-06 |

## New Dependencies

| Package | Purpose | Size | License |
|---|---|---|---|
| `@react-pdf/renderer` | PDF report templates (DD-4) | ~500KB | MIT |
| `papaparse` | CSV generation (TD-2) | ~45KB | MIT |
| `jszip` | ZIP bundling (TD-3) | ~290KB | MIT/GPL |
| `@vercel/blob` | Temp ZIP storage (TD-6) | ~40KB | Apache-2.0 |

All server-side use. No new client-side bundle impact.

## Schema Changes

Drizzle migration file: `drizzle/0002_phase_f_tax_prep.sql` (generated via `npx drizzle-kit push`)

### 1. `financial_subcategories` — extend

```typescript
atoCodePersonal: text('ato_code_personal'),     // nullable; AC-001
atoCodeCompany:  text('ato_code_company'),      // nullable; AC-001
```

The existing `atoCode` column stays for backward compatibility until the Categorise page migration completes, then dropped in a follow-up. Seed migration populates both columns from the TS constant `SUBCATEGORY_ATO_MAP` in `src/lib/financials/ato-codes.ts`.

### 2. `financial_transactions` — extend (AC-002)

```typescript
atoCodePersonal:           text('ato_code_personal'),             // confirmed personal code
aiSuggestedAtoCodePersonal:text('ai_suggested_ato_code_personal'),// AI proposal
atoCodeCompany:            text('ato_code_company'),              // confirmed company code
aiSuggestedAtoCodeCompany: text('ai_suggested_ato_code_company'), // AI proposal
```

Indexes:
```typescript
index('idx_fin_txn_ato_personal').on(table.atoCodePersonal),
index('idx_fin_txn_ato_company').on(table.atoCodeCompany),
```

### 3. `financial_entities` — extend (AC-014, resolves RG-2)

```typescript
invoiceDriveFolder: text('invoice_drive_folder'), // Drive folder path, nullable
```

### 4. `ato_codes` — new (TD-1)

```typescript
export const atoCodes = pgTable('ato_codes', {
  code: text('code').primaryKey(),                   // e.g. 'D1', '6-MV'
  scope: text('scope').notNull(),                    // 'personal' | 'company'
  section: text('section').notNull(),                // 'income' | 'deduction' | 'expense' | 'other'
  label: text('label').notNull(),                    // 'D1 — Work-related car expenses'
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  isInternalSubcode: boolean('is_internal_subcode').default(false), // for 6-OTHER-* rollups
  rollsUpTo: text('rolls_up_to'),                    // e.g. '6-OTHER-EXP' for sub-codes
  createdAt: timestamp('created_at').defaultNow(),
})
```

Index: `idx_ato_codes_scope` on `scope`.

Seeded via migration from `src/lib/financials/ato-codes.ts` constants (14 personal + 29 company = 43 rows).

### 5. `app_settings` — new (TD-4, resolves RG-3)

```typescript
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),                     // e.g. 'ai_claude_enabled_ato'
  value: jsonb('value'),                             // boolean | string | number | object
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
})
```

Initial seed rows:
- `('ai_claude_enabled_ato', false, now(), null)`

### 6. `invoice_tags` — new (TD-5, resolves RG-5)

```typescript
export const invoiceTags = pgTable('invoice_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  gdriveFileId: text('gdrive_file_id').notNull().unique(),
  entityId: uuid('entity_id').references(() => financialEntities.id, { onDelete: 'set null' }),
  fy: text('fy').notNull(),                          // 'FY2025-26'
  filename: text('filename').notNull(),              // cached display name
  supplier: text('supplier'),
  amount: numeric('amount', { precision: 12, scale: 2 }),
  atoCodePersonal: text('ato_code_personal'),
  atoCodeCompany: text('ato_code_company'),
  linkedTxnId: uuid('linked_txn_id').references(() => financialTransactions.id, { onDelete: 'set null' }),
  matchStatus: text('match_status').default('unmatched'), // 'matched' | 'unmatched' | 'verified'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_invoice_tags_entity_fy').on(table.entityId, table.fy),
  index('idx_invoice_tags_linked_txn').on(table.linkedTxnId),
])
```

### 7. `export_jobs` — new (TD-6, resolves RG-4)

```typescript
export const exportJobs = pgTable('export_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  fy: text('fy').notNull(),
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'complete' | 'error' | 'cancelled'
  progressPercent: integer('progress_percent').default(0),
  currentStep: text('current_step'),
  blobUrl: text('blob_url'),                         // Vercel Blob signed URL
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  expiresAt: timestamp('expires_at').notNull(),      // created_at + 1 hour
}, (table) => [
  index('idx_export_jobs_status').on(table.status),
  index('idx_export_jobs_expires').on(table.expiresAt),
])
```

Cleanup: a small DELETE on `export_jobs WHERE expires_at < now()` runs opportunistically on every `POST /export/start` call (no cron needed).

## API Contracts

### Tax export

#### POST /api/financials/tax/export/start
Auth: admin only (403 otherwise)
Request body:
```json
{
  "fy": "FY2025-26",
  "entityIds": ["uuid", "uuid", "uuid"] | null  // null = all entities
}
```
Response 200:
```json
{ "jobId": "uuid" }
```
Effects: creates `export_jobs` row with status `pending`, spawns async generation task.
Errors: 400 (bad FY format), 401, 403.

#### GET /api/financials/tax/export/{id}/stream
Auth: admin only. Content-Type: `text/event-stream`.
Events emitted (one per line, `data: {...json...}\n\n`):
```json
{ "type": "progress", "step": "Querying D3 Pty Ltd transactions", "percent": 12 }
{ "type": "progress", "step": "Rendering Personal report PDF (2/4)", "percent": 45 }
{ "type": "complete", "blobUrl": "https://...", "expiresAt": "2026-04-06T16:00:00Z" }
{ "type": "error", "message": "Drive folder not found for Babyccino" }
```
Stream closes after `complete` or `error`. Client must handle reconnect if connection drops (re-open stream; server re-reads `export_jobs.status` and resumes from last step).

#### POST /api/financials/tax/export/{id}/cancel
Auth: admin only.
Effects: updates `export_jobs.status` to `cancelled`, signals the async task to abort on next step boundary.

#### GET /api/financials/tax/export/history
Auth: admin only.
Response 200:
```json
{ "jobs": [{ "id", "fy", "status", "createdAt", "completedAt", "blobUrl", "expired": bool }] }
```
Last 20 jobs, ordered by `createdAt DESC`.

### AI cost estimate

#### GET /api/settings/ai-cost-estimate
Auth: admin only.
Response 200:
```json
{
  "model": "claude-haiku-4-5",
  "pricing": { "inputPer1M": 1.00, "outputPer1M": 5.00, "currency": "USD", "asOf": "2026-04" },
  "estimates": {
    "perImport": { "txnCount": 100, "cost": 0.07 },
    "monthly":   { "txnCount": 487, "cost": 0.34 },
    "backfill":  { "txnCount": 10234, "cost": 7.16, "onlyShownWhenToggleOff": true }
  },
  "currentSetting": { "enabled": false }
}
```
Computation:
- `perImportTxnCount` = 100 (fixed assumption)
- `monthlyTxnCount` = `SELECT count(*) FROM financial_transactions WHERE created_at > now() - interval '90 days'` ÷ 3
- `backfillTxnCount` = `SELECT count(*) FROM financial_transactions WHERE ai_suggested_ato_code_personal IS NULL AND ai_suggested_ato_code_company IS NULL`
- Cost per txn: `(400 input tokens × $1/1M) + (50 output tokens × $5/1M)` = `$0.00065/txn`
- Only the `backfill` field is present if `currentSetting.enabled == false`

### AI toggle

#### POST /api/settings/ai-claude-toggle
Auth: admin only.
Request body:
```json
{ "enabled": true, "confirmed": true }
```
Effects: upserts `app_settings.ai_claude_enabled_ato = <enabled>`. Requires `confirmed: true` to enforce the client-side confirmation dialog.
Errors: 400 if `confirmed !== true`.

### Invoice tags

#### GET /api/financials/tax/invoices?entityId={id}&fy={fy}
Auth: admin only.
Effects: Drive-scan `entities.invoice_drive_folder` for the entity, cross-reference with `invoice_tags` table, return unified list.
Response 200:
```json
{
  "files": [{
    "gdriveFileId": "...",
    "filename": "bunnings-2025-10-14.pdf",
    "driveUrl": "...",
    "mimeType": "application/pdf",
    "tag": { "supplier": "Bunnings", "amount": 127.50, "linkedTxnId": "uuid", "matchStatus": "matched" } | null
  }],
  "unmatched": 3
}
```

#### PUT /api/financials/tax/invoices/{gdriveFileId}
Auth: admin only.
Request body:
```json
{
  "entityId": "uuid",
  "fy": "FY2025-26",
  "supplier": "Bunnings",
  "amount": 127.50,
  "atoCodePersonal": "D5" | null,
  "atoCodeCompany": "6-OTHER-OFFICE" | null,
  "linkedTxnId": "uuid" | null,
  "notes": "..." | null
}
```
Effects: upserts `invoice_tags` row keyed by `gdriveFileId`.

### Categorise ATO acceptance

#### PATCH /api/financials/categorize/merchant
(Extends existing endpoint — adds ATO fields)
Request body (new fields):
```json
{
  "merchantName": "Bunnings",
  "category": "BUSINESS EXPENSES",
  "subcategory": "Equipment & Technology",
  "atoCodePersonal": "D5" | null,      // NEW
  "atoCodeCompany": "6-DEPN" | null,   // NEW
  "acceptAiSuggestions": false          // NEW, if true: copies ai_suggested_* into confirmed columns
}
```
Effects: single UPDATE on `financial_transactions WHERE merchant_name = $1` writes category, subcategory, `ato_code_personal`, `ato_code_company`.

## Data Models (TypeScript types)

```typescript
// src/types/financials.ts (additions)

export type AtoScope = 'personal' | 'company'

export interface AtoCode {
  code: string                   // 'D1', '6-MV'
  scope: AtoScope
  section: 'income' | 'deduction' | 'expense' | 'other'
  label: string
  description: string | null
  sortOrder: number
  isInternalSubcode: boolean
  rollsUpTo: string | null
}

export interface InvoiceFile {
  gdriveFileId: string
  filename: string
  driveUrl: string
  mimeType: string
  tag: InvoiceTag | null
}

export interface InvoiceTag {
  supplier: string | null
  amount: number | null
  atoCodePersonal: string | null
  atoCodeCompany: string | null
  linkedTxnId: string | null
  matchStatus: 'matched' | 'unmatched' | 'verified'
  notes: string | null
}

export type ExportJobStatus = 'pending' | 'running' | 'complete' | 'error' | 'cancelled'

export interface ExportJob {
  id: string
  fy: string
  status: ExportJobStatus
  progressPercent: number
  currentStep: string | null
  blobUrl: string | null
  createdAt: string
  completedAt: string | null
}

export interface ExportProgressEvent {
  type: 'progress' | 'complete' | 'error'
  step?: string
  percent?: number
  blobUrl?: string
  expiresAt?: string
  message?: string
}

export interface AiCostEstimate {
  model: string
  pricing: { inputPer1M: number; outputPer1M: number; currency: string; asOf: string }
  estimates: {
    perImport: { txnCount: number; cost: number }
    monthly:   { txnCount: number; cost: number }
    backfill?: { txnCount: number; cost: number }
  }
  currentSetting: { enabled: boolean }
}
```

## Algorithms

### Rule-based ATO lookup (TD-7 — approved)

File: `src/lib/financials/ato-proposer.ts`

```typescript
export function proposeAtoCodes(
  txn: FinancialTransaction,
  subcat: FinancialSubcategory | null,
  entityType: 'personal' | 'business' | 'trust' | null
): { aiPersonal: string | null; aiCompany: string | null } {

  // Step 1 — subcategory defaults
  let aiPersonal = subcat?.atoCodePersonal ?? null
  let aiCompany  = subcat?.atoCodeCompany ?? null

  // Step 2 — scope by entity type
  if (entityType === 'personal') {
    aiCompany = null
  } else if (entityType === 'business' || entityType === 'trust') {
    aiPersonal = null
  }
  // else: fallback — populate both, flag needs_review

  // Step 3 — refinements (see REFINEMENT_RULES in ato-codes.ts)
  aiPersonal = applyPersonalRefinements(aiPersonal, txn, subcat)
  aiCompany  = applyCompanyRefinements(aiCompany, txn, subcat)

  return { aiPersonal, aiCompany }
}
```

Refinement rules live in a typed table in `ato-codes.ts`:

```typescript
export const REFINEMENT_RULES: RefinementRule[] = [
  {
    id: 'streaming-never-deductible',
    scope: 'personal',
    when: (txn, subcat) => subcat?.name === 'Streaming',
    set: null,
  },
  {
    id: 'saas-entertainment-regex',
    scope: 'personal',
    when: (txn, subcat) =>
      subcat?.name === 'Software & SaaS' &&
      /netflix|spotify|disney|stan|kayo|prime/i.test(txn.merchantName ?? ''),
    set: null,
  },
  {
    id: 'clothing-requires-uniform-keyword',
    scope: 'personal',
    when: (txn, subcat) =>
      subcat?.name === 'Clothing & Apparel' &&
      !/uniform|ppe|safety|work wear/i.test(txn.descriptionRaw ?? ''),
    set: null,
  },
  {
    id: 'courses-under-50-non-deductible',
    scope: 'personal',
    when: (txn, subcat) => subcat?.name === 'Courses & Books' && Math.abs(+txn.amount) < 50,
    set: null,
  },
  {
    id: 'equipment-over-300-depreciation',
    scope: 'company',
    when: (txn, subcat) =>
      subcat?.name === 'Equipment & Technology' && Math.abs(+txn.amount) > 300,
    set: '6-DEPN',
  },
  // ...more in the file
]
```

Called from:
- `src/app/api/financials/ingest/route.ts` — per new txn, synchronously before DB write
- `src/scripts/backfill-ato-proposals.ts` — one-off backfill (AC-005)

### Claude hybrid path

Only runs if `app_settings.ai_claude_enabled_ato === true` AND the rule-based proposer returned `null` for one or both columns.

```typescript
async function enhanceWithClaude(
  txn: FinancialTransaction,
  ruleBased: { aiPersonal: string | null; aiCompany: string | null }
): Promise<{ aiPersonal: string | null; aiCompany: string | null }> {

  if (ruleBased.aiPersonal && ruleBased.aiCompany) return ruleBased
  if (!(await isClaudeEnabled())) return ruleBased

  const prompt = buildClaudePrompt(txn, ATO_CODES_PERSONAL, ATO_CODES_COMPANY)
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }],
  })
  const parsed = parseClaudeAtoResponse(response.content)

  return {
    aiPersonal: ruleBased.aiPersonal ?? parsed.personal,
    aiCompany:  ruleBased.aiCompany ?? parsed.company,
  }
}
```

Error handling: any Claude API failure falls back to the rule-based proposal silently (logged to `parse_errors`). Never blocks ingest.

### Cost estimation formula (AC-025)

```typescript
const COST_PER_TXN_USD =
  (400 / 1_000_000) * 1.00 +   // 400 input tokens × $1/1M
  (50  / 1_000_000) * 5.00     // 50 output tokens  × $5/1M
// = $0.00065

function estimateCosts(monthlyTxnVolume: number, backfillTxnCount: number) {
  return {
    perImport: { txnCount: 100, cost: round(100 * COST_PER_TXN_USD, 2) },
    monthly:   { txnCount: monthlyTxnVolume, cost: round(monthlyTxnVolume * COST_PER_TXN_USD, 2) },
    backfill:  { txnCount: backfillTxnCount, cost: round(backfillTxnCount * COST_PER_TXN_USD, 2) },
  }
}
```

### Drive folder scan (TD-8)

```typescript
export async function scanInvoiceFolder(
  folderPath: string,
  accessToken: string
): Promise<DriveInvoiceFile[]> {
  const folderId = await resolveFolderIdFromPath(folderPath, accessToken)
  if (!folderId) throw new Error(`Folder not found: ${folderPath}`)

  const files = await listFiles(accessToken, {
    q: `'${folderId}' in parents and trashed=false`,
    pageSize: 500,
    fields: 'files(id,name,mimeType,webViewLink,modifiedTime,size)',
  })

  return files
    .filter(f => ALLOWED_INVOICE_MIME.has(f.mimeType))
    .slice(0, 500)
}

const ALLOWED_INVOICE_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
```

## State Management Spec

Tax Prep page:
```typescript
// URL search params (shareable)
type TaxPrepUrlState = {
  fy: string              // 'FY2025-26'
  tab: 'overview' | 'invoices' | 'export'
  entity?: string         // only on invoices tab — selected entity ID
}

// Local React state per tab
type OverviewTabState = {
  entities: EntitySummary[] | null
  loading: boolean
}

type InvoicesTabState = {
  files: InvoiceFile[] | null
  selectedFileId: string | null
  drawerOpen: boolean
  saving: boolean
}

type ExportTabState = {
  jobId: string | null
  progressEvents: ExportProgressEvent[]
  downloadUrl: string | null
  error: string | null
  history: ExportJob[]
}
```

Categorise page extension: existing `changes: Map<string, MerchantChanges>` gains two fields:
```typescript
type MerchantChanges = {
  category?: string            // existing
  subcategory?: string         // existing
  atoCodePersonal?: string | null   // NEW
  atoCodeCompany?: string | null    // NEW
}
```

Settings AI panel:
```typescript
type AiCostPanelState = {
  estimate: AiCostEstimate | null
  loading: boolean
  toggling: boolean
  confirmDialogOpen: boolean
  pendingAction: 'enable' | 'disable' | null
}
```

## Error Handling Strategy

| Failure | Response |
|---|---|
| Drive folder not found | Log, emit SSE error event, add to outstanding items, continue export with empty invoices folder |
| Individual Drive file fetch fails | Log, skip file, add to outstanding items, continue |
| Claude API call fails | Log to `parse_errors`, fall back to rule-based, continue ingest (never blocks) |
| PDF render fails for one entity | Log, mark that entity's subfolder with `GENERATION_ERROR.txt`, continue with other entities, surface in final SSE event |
| Vercel Blob upload fails | Retry once with exponential backoff; on second failure, fail the entire export job with error status |
| Export job taking >5 min | SSE emits heartbeat every 10s; client shows "Still running..."; hard timeout at 10 min kills the job |
| Database query timeout on a large FY | Streaming cursor via Drizzle to avoid loading all rows into memory |
| SSE connection drops | Client re-opens stream; server re-reads `export_jobs` row; resumes progress reporting from current state |

## Security Considerations

- All new API routes use the existing auth pattern: `auth()` then admin role check (403 otherwise)
- `GET /api/financials/tax/export/{id}/stream` must verify the job was created by an admin (no cross-job access)
- Vercel Blob URLs are signed with a 1-hour TTL — after expiry, the URL is useless even if leaked
- `invoice_drive_folder` paths are stored as-is; no shell injection risk (Drive API uses IDs, not paths, after resolution)
- Claude API key stored in Vercel env (`ANTHROPIC_API_KEY`) — never sent to client
- Invoice file downloads from Drive use the admin's existing OAuth tokens (already granted for statement import)
- `POST /api/settings/ai-claude-toggle` requires `confirmed: true` flag as a server-enforced extra check against CSRF-style mis-clicks

## Performance Considerations

| Hot path | Optimisation |
|---|---|
| Ingest pipeline ATO proposal | Rule-based only, in-process, zero DB hits (subcategory passed as argument). Claude path is opt-in + only for null fallbacks |
| Report query per entity | Single query with `JOIN accounts ON entity_id` filtered by FY date range and entity; `idx_fin_txn_date`, `idx_fin_txn_account`, `idx_fin_txn_ato_personal`, `idx_fin_txn_ato_company` indexes cover it |
| CSV generation | Streamed directly into JSZip entries (no intermediate arrays); papaparse supports `step` callback for streaming |
| PDF generation | `@react-pdf/renderer` runs off the event loop; one PDF per entity, sequentially; total ~5-10s for typical FY |
| Drive scan | Single API call per entity (500 files max); cached in-memory for the duration of the export job |
| Cost estimate endpoint | 2 count queries, both fast with existing indexes; no caching (always fresh on page load) |
| Invoice admin drawer | File preview is `<iframe src={driveUrl}>` — zero server bandwidth |
| Export job cleanup | Opportunistic DELETE on `expires_at < now()` during each new export start — no cron needed |

## Integration Points

- **Google Drive API** — existing `src/lib/gdrive/client.ts`, adds folder resolution + scan helpers
- **Anthropic Claude API** — existing `@anthropic-ai/sdk` (already in package.json), adds ATO proposal prompt
- **Vercel Blob** — NEW `@vercel/blob`, requires `BLOB_READ_WRITE_TOKEN` env var
- **Neon Postgres** — all via existing Drizzle client
- **NextAuth** — existing `auth()` for access control; `users.id` referenced from `export_jobs.requested_by` and `app_settings.updated_by`

## Cross-App Technical Impact

- **Financials / Ingest** — modified to call `proposeAtoCodes()` on every new transaction; adds ~5ms per row, negligible
- **Financials / Categorize** — existing PATCH endpoint extended; backward-compatible (old payload still works, ATO fields are additive)
- **Financials / Transactions API** — read endpoints must return the new columns; no breaking change
- **Home page Tax card stats** — new metric "unreviewed ATO codes" added to the card; existing stats unchanged
- **Settings** — new `AiCostPanel` component; entity edit form gains `invoice_drive_folder` field
- **Tasks / Scan / other domains** — no impact

## Environment Variables

New:
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob access token (set via `vercel env` or Vercel dashboard)

Existing (unchanged):
- `ANTHROPIC_API_KEY` — used by Claude hybrid path (only read when `app_settings.ai_claude_enabled_ato === true`)
- `DATABASE_URL` — Neon
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET` — auth

## Open Technical Decisions

None — all 8 TDs resolved, all 5 RGs from design addressed (RG-1 in requirements v0.2, RG-2 schema §3, RG-3 schema §5, RG-4 schema §7, RG-5 schema §6).
