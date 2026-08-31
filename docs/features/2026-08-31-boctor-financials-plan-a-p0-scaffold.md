# Boctor Financials — Plan A (P0 + Scaffold) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sever the last foreign key tying Financials to the hub, then stand up a deployed, sign-in-able `boctor-financials` skeleton that owns the financial schema — ready for the 16,633 LOC parity move in Plan B.

**Architecture:** Two Next.js apps over one Neon database with disjoint table ownership. This plan does not move any feature code. It makes the hub's schema severable, creates the new repo with its own NextAuth tables (`bf_*`) and its own Google grant, points it at the existing 14 financial tables read-only, and deploys it. The hub keeps running and serving `/financials` untouched throughout.

**Tech Stack:** Next.js 16.2.1 (App Router, Turbopack) · React 19.2.4 · Drizzle ORM 0.45 · `@neondatabase/serverless` · NextAuth v5 beta + `@auth/drizzle-adapter` · Vitest 4 · Tailwind + shadcn (base-ui) · Vercel

**Spec:** `docs/features/2026-08-31-boctor-financials-extraction.md`

## Global Constraints

- **Never commit or deploy without explicit user instruction.** Every task ends staged; the user runs the release gate.
- Next.js 16.2.1 — read `node_modules/next/dist/docs/` before writing framework code. This is not the Next.js in training data.
- Commit format: `feat|fix|chore|refactor|docs|schema(scope): description [vX.Y.Z]`
- Naming: files kebab-case · components PascalCase · functions camelCase · constants UPPER_SNAKE_CASE · DB tables snake_case
- Vitest only discovers `src/**/*.test.ts` (see `vitest.config.ts`). Tests outside `src/` will not run.
- Production schema changes use **idempotent guarded SQL**, never `drizzle-kit push` — precedent set in v0.4.2 to remove any chance of a destructive diff against live data.
- Auth pattern for every admin API: `auth()` → 401 if no `session.user.id` → 403 if `role !== 'admin'`.
- The new app must touch **only** its own 19 tables. Never `profiles`, `tasks`, `emails_scanned`, `app_settings`, or any hub table.
- Port **3007** for `boctor-financials`, both checkouts, one dev server at a time.

---

## File Structure

**Hub (`C:/Users/MagedBoctor/orca/family-action-hub`) — Task 1 only:**

| File | Responsibility |
|---|---|
| `src/lib/db/schema.ts:482` | `export_jobs.requested_by` changes from `uuid` FK to `text` |
| `src/lib/db/__tests__/boundary.test.ts` | **New.** Guards AC-005 — asserts no financials table references `profiles` |
| `scripts/sever-export-jobs-fk.sql` | **New.** Idempotent guarded migration |

**New repo (`C:/Users/MagedBoctor/orca/boctor-financials`) — Tasks 2-6:**

| File | Responsibility |
|---|---|
| `src/lib/db/index.ts` | Neon + Drizzle client (copied verbatim from hub) |
| `src/lib/db/schema.ts` | The 14 financial tables + 5 `bf_*` tables. Nothing else. |
| `src/lib/db/__tests__/ownership.test.ts` | Guards AC-004 — asserts the schema declares only the 19 owned tables |
| `src/lib/auth.ts` | NextAuth over `bf_*` tables, Google with Drive + Gmail scopes |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth handlers |
| `src/app/login/page.tsx` | Sign-in page |
| `src/app/page.tsx` | Placeholder home — proves auth + DB read work end to end |
| `CLAUDE.md` / `AGENTS.md` | Project instructions, incl. "commit before switching editors" |
| `docs/features/` | The spec and this plan, copied so the new session has context |

---

## Task 1: Sever the `export_jobs` foreign key (hub)

The only FK leaving the financials cluster. Nullable audit field, `onDelete: 'set null'` — nothing depends on its referential integrity.

**Files:**
- Modify: `src/lib/db/schema.ts:482`
- Create: `src/lib/db/__tests__/boundary.test.ts`
- Create: `scripts/sever-export-jobs-fk.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `exportJobs.requestedBy` becomes `text` holding an email string. Any later code writing it must pass `session.user.email`, not `session.user.id`.

- [ ] **Step 1: Write the failing boundary test**

Create `src/lib/db/__tests__/boundary.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AC-005 — no foreign key may cross from the financials cluster to the hub cluster.
 * Guards the extraction boundary at the source level: if someone adds a
 * `references(() => profiles.id)` to a financials table, this fails.
 */
const FINANCIALS_TABLES = [
  'financialCategories', 'financialSubcategories', 'financialEntities',
  'financialAccounts', 'financialStatements', 'financialTransactions',
  'transactionSplits', 'financialAssumptions', 'parseErrors', 'atoCodes',
  'invoiceTags', 'exportJobs', 'invoiceSuppliers', 'invoices',
]

const HUB_TABLES = ['profiles', 'tasks', 'emailsScanned', 'gmailAccounts', 'appSettings']

function blockFor(src: string, table: string): string {
  const start = src.indexOf(`export const ${table} = pgTable(`)
  if (start === -1) throw new Error(`table ${table} not found in schema.ts`)
  const end = src.indexOf('\nexport const ', start + 1)
  return src.slice(start, end === -1 ? src.length : end)
}

describe('extraction boundary', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/db/schema.ts'), 'utf8')

  it('declares every financials table', () => {
    for (const t of FINANCIALS_TABLES) {
      expect(src).toContain(`export const ${t} = pgTable(`)
    }
  })

  it('has no financials table referencing a hub table', () => {
    const violations: string[] = []
    for (const table of FINANCIALS_TABLES) {
      const block = blockFor(src, table)
      for (const hub of HUB_TABLES) {
        if (block.includes(`=> ${hub}.`)) violations.push(`${table} -> ${hub}`)
      }
    }
    expect(violations).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/lib/db/__tests__/boundary.test.ts
```

Expected: FAIL on the second test with `[ 'exportJobs -> profiles' ]` — that is the FK we are removing. The first test should already pass.

- [ ] **Step 3: Change the column in the schema**

In `src/lib/db/schema.ts`, replace line 482:

```ts
  requestedBy: uuid('requested_by').references(() => profiles.id, { onDelete: 'set null' }),
```

with:

```ts
  // Email string, not a FK. Severed 2026-08-31 so the financials cluster has no
  // reference into the hub cluster — see docs/features/2026-08-31-boctor-financials-extraction.md S1.
  requestedBy: text('requested_by'),
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
npx vitest run src/lib/db/__tests__/boundary.test.ts
```

Expected: PASS, both tests.

- [ ] **Step 5: Write the idempotent migration**

Create `scripts/sever-export-jobs-fk.sql`:

```sql
-- S1 — export_jobs.requested_by: uuid FK -> profiles.id  becomes  text (email).
-- Idempotent: guarded on the column still being uuid, so re-running is a no-op.
-- Safe to run while the hub is live: the column is nullable and read-only in practice.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'export_jobs'
      AND column_name = 'requested_by'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE export_jobs ADD COLUMN requested_by_email text;

    UPDATE export_jobs ej
       SET requested_by_email = p.email
      FROM profiles p
     WHERE ej.requested_by = p.id;

    ALTER TABLE export_jobs DROP COLUMN requested_by;
    ALTER TABLE export_jobs RENAME COLUMN requested_by_email TO requested_by;

    RAISE NOTICE 'S1 applied: export_jobs.requested_by is now text';
  ELSE
    RAISE NOTICE 'S1 already applied, skipping';
  END IF;
END $$;
```

- [ ] **Step 6: Check what will change before running it**

```bash
node -e "
require('dotenv').config({path:'.env.local'});
const {neon}=require('@neondatabase/serverless');
const sql=neon(process.env.DATABASE_URL);
sql\`SELECT data_type FROM information_schema.columns WHERE table_name='export_jobs' AND column_name='requested_by'\`
  .then(r=>console.log('current type:',r));
sql\`SELECT count(*) FROM export_jobs\`.then(r=>console.log('rows:',r));
sql\`SELECT count(*) FROM export_jobs WHERE requested_by IS NOT NULL\`.then(r=>console.log('rows with a value:',r));
"
```

Expected: `uuid`, and a small row count. Record the numbers — Step 8 verifies against them.

- [ ] **Step 7: Apply the migration**

```bash
node -e "
require('dotenv').config({path:'.env.local'});
const {neon}=require('@neondatabase/serverless');
const fs=require('fs');
neon(process.env.DATABASE_URL)(fs.readFileSync('scripts/sever-export-jobs-fk.sql','utf8'))
  .then(()=>console.log('applied')).catch(e=>{console.error(e);process.exit(1)});
"
```

- [ ] **Step 8: Verify the change landed and lost nothing**

```bash
node -e "
require('dotenv').config({path:'.env.local'});
const {neon}=require('@neondatabase/serverless');
const sql=neon(process.env.DATABASE_URL);
sql\`SELECT data_type FROM information_schema.columns WHERE table_name='export_jobs' AND column_name='requested_by'\`
  .then(r=>console.log('type (expect text):',r));
sql\`SELECT count(*) FROM export_jobs\`.then(r=>console.log('rows (expect unchanged):',r));
sql\`SELECT requested_by FROM export_jobs WHERE requested_by IS NOT NULL LIMIT 3\`
  .then(r=>console.log('sample (expect emails):',r));
"
```

Expected: `text`, the same row count as Step 6, and email strings rather than UUIDs.

- [ ] **Step 9: Run the whole suite**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/lib/db/schema.ts
```

Expected: 161 passed (159 existing + 2 new), tsc exit 0, eslint exit 0.

If `tsc` reports an error in tax-export code assigning a UUID to `requestedBy`, fix it there by passing the session email instead — search with `grep -rn "requestedBy" src/`.

- [ ] **Step 10: Stage and hand to the user**

```bash
git add src/lib/db/schema.ts src/lib/db/__tests__/boundary.test.ts scripts/sever-export-jobs-fk.sql
git status --short
```

Do **not** commit. Present the release gate: version bump menu and the commit/push/deploy options. Suggested message:

```
schema(financials): sever export_jobs FK to profiles [S1]
```

---

## Task 2: Create the repo and both checkouts

No code yet — this is the workspace bootstrap from spec §8. Getting it wrong is what stranded work at the start of the 2026-08-31 session.

**Files:**
- Create: `C:/Users/MagedBoctor/Claude/boctor-financials/` (canonical for memory)
- Create: `C:/Users/MagedBoctor/orca/boctor-financials/`
- Modify: `C:/Users/MagedBoctor/.claude/CLAUDE.md` (port registry)

**Interfaces:**
- Consumes: nothing.
- Produces: an empty pushed repo at `github.com/mboctor1967/boctor-financials`, two checkouts, port 3007 registered, memory junctioned.

- [ ] **Step 1: Create the GitHub repo**

```bash
gh repo create mboctor1967/boctor-financials --private \
  --description "Boctor Financials — cost analysis, net worth, retirement scenarios, asset views"
```

- [ ] **Step 2: Create the canonical (VS Code) checkout**

```bash
cd "C:/Users/MagedBoctor/Claude"
git clone https://github.com/mboctor1967/boctor-financials.git
cd boctor-financials && git commit --allow-empty -m "chore: initial commit" && git push -u origin master
```

If the default branch comes back as `main`, rename it now so it matches the hub: `git branch -m main master && git push -u origin master`.

- [ ] **Step 3: Create the Orca checkout**

```bash
cd "C:/Users/MagedBoctor/orca"
git clone https://github.com/mboctor1967/boctor-financials.git
```

- [ ] **Step 4: Register port 3007**

In `C:/Users/MagedBoctor/.claude/CLAUDE.md`, replace the `| 3007 | _(unassigned)_ | — |` row with:

```
| 3007 | boctor-financials | `C:/Users/MagedBoctor/orca/boctor-financials` (primary) · `C:/Users/MagedBoctor/Claude/boctor-financials` (VS Code, same port — run only one at a time) |
| 3008 | _(unassigned)_ | — |
```

- [ ] **Step 5: Junction the Orca memory folder to the canonical one**

The Orca workspace's memory dir must be empty first — verify, then link.

```powershell
$link   = 'C:\Users\MagedBoctor\.claude\projects\C--Users-MagedBoctor-orca-boctor-financials\memory'
$target = 'C:\Users\MagedBoctor\.claude\projects\C--Users-MagedBoctor-Claude-boctor-financials\memory'
New-Item -ItemType Directory -Force -Path $target | Out-Null
if ((Get-ChildItem -LiteralPath $link -Force -ErrorAction SilentlyContinue).Count -gt 0) { throw 'link dir not empty' }
Remove-Item -LiteralPath $link -Force -Recurse -ErrorAction SilentlyContinue
New-Item -ItemType Junction -Path $link -Target $target
```

- [ ] **Step 6: Verify the junction**

```powershell
(Get-Item -LiteralPath 'C:\Users\MagedBoctor\.claude\projects\C--Users-MagedBoctor-orca-boctor-financials\memory').LinkType
```

Expected: `Junction`.

---

## Task 3: Scaffold the Next.js app

**Files:**
- Create: the Next.js app in `C:/Users/MagedBoctor/orca/boctor-financials`
- Create: `CLAUDE.md`, `AGENTS.md`, `.env.local.example`, `vitest.config.ts`
- Create: `docs/features/` holding copies of the spec and this plan

**Interfaces:**
- Consumes: the empty repo from Task 2.
- Produces: `npm run dev -- -p 3007` serves a page; `npx vitest run` runs.

- [ ] **Step 1: Scaffold**

```bash
cd "C:/Users/MagedBoctor/orca"
npx create-next-app@16.2.1 boctor-financials-tmp --typescript --tailwind --app --src-dir --no-turbopack --import-alias "@/*" --use-npm
```

Then move the generated files into the existing clone (which already has `.git`), and delete `boctor-financials-tmp`. Do not overwrite `.git`.

- [ ] **Step 2: Pin the versions the hub uses**

Match the hub so Plan B's code moves without version drift:

```bash
cd "C:/Users/MagedBoctor/orca/boctor-financials"
npm install next@16.2.1 react@19.2.4 react-dom@19.2.4
npm install drizzle-orm@^0.45.2 @neondatabase/serverless@^1.0.2 next-auth@^5.0.0-beta.30 @auth/drizzle-adapter@^1.11.1
npm install -D drizzle-kit vitest@^4 tsx dotenv
```

- [ ] **Step 3: Add the vitest config**

Create `vitest.config.ts` — identical to the hub's so tests port over unchanged:

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 4: Add the drizzle config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

- [ ] **Step 5: Write `AGENTS.md`**

```markdown
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all
differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/`
before writing any code. Heed deprecation notices.
```

- [ ] **Step 6: Write `CLAUDE.md`**

It must carry the hub's conventions plus the D5 mitigation. At minimum:

```markdown
@AGENTS.md

# Project — Boctor Financials

Next.js App Router app for cost analysis, net worth, retirement scenarios, per-asset
views and optimisation opportunities. Extracted from family-action-hub 2026-08-31.
Solo developer: Maged Boctor.

## Two checkouts — read this first

This project has TWO local checkouts sharing one dev-server port:

| Checkout | Path | Role |
|---|---|---|
| Orca | `C:/Users/MagedBoctor/orca/boctor-financials` | primary |
| VS Code | `C:/Users/MagedBoctor/Claude/boctor-financials` | canonical for Claude memory |

- **Commit and push before switching editors.** Uncommitted work in one checkout is
  invisible to the other. This exact situation stranded v0.5.0 work in family-action-hub.
- **Port 3007, one dev server at a time.** `npm run dev -- -p 3007`.
- `AUTH_URL=http://localhost:3007`. Only that redirect URI is registered with Google.

## Database — shared, with hard ownership

Shares one Neon instance with family-action-hub. **This app owns 19 tables and must
never read or write any other.** Owned: the 14 `financial_*` / `invoice*` / `ato_codes`
/ `parse_errors` / `export_jobs` / `transaction_splits` tables, plus `bf_profiles`,
`bf_accounts`, `bf_sessions`, `bf_verification_tokens`, `bf_app_settings`.

Never touch: `profiles`, `accounts`, `sessions`, `tasks`, `emails_scanned`,
`gmail_accounts`, `app_settings`, or any `whatsapp_*` / `notion_*` table.
`src/lib/db/__tests__/ownership.test.ts` enforces this.

## Rotating GOOGLE_CLIENT_SECRET breaks TWO apps

This app and family-action-hub hold separate grants against the same OAuth client.
After any secret rotation, BOTH must be re-consented. Missing this step cost four
months of silent scan failure in 2026-05.

## Conventions

Inherited from family-action-hub: commit format `feat|fix|chore|refactor|docs|schema(scope): description [vX.Y.Z]`,
TDD discipline, AC traceability, the release-gate option menu, and **never commit or
deploy without explicit user instruction**.
```

- [ ] **Step 7: Copy the spec and this plan into the new repo**

```bash
mkdir -p "C:/Users/MagedBoctor/orca/boctor-financials/docs/features"
cp "C:/Users/MagedBoctor/orca/family-action-hub/docs/features/2026-08-31-boctor-financials-extraction.md" \
   "C:/Users/MagedBoctor/orca/family-action-hub/docs/features/2026-08-31-boctor-financials-plan-a-p0-scaffold.md" \
   "C:/Users/MagedBoctor/orca/boctor-financials/docs/features/"
```

This is what gives the Plan B session its context.

- [ ] **Step 8: Verify it runs**

```bash
cd "C:/Users/MagedBoctor/orca/boctor-financials"
npm run dev -- -p 3007
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3007/
```

Expected: HTTP 200.

- [ ] **Step 9: Stage and hand to the user**

```bash
git add -A && git status --short
```

Do not commit. Suggested message: `chore: scaffold boctor-financials [v0.1.0]`

---

## Task 4: Financial schema and DB layer

The new app declares the 14 tables it now owns. No data moves — these tables already exist and hold live data.

**Files:**
- Create: `src/lib/db/index.ts`
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/db/__tests__/ownership.test.ts`

**Interfaces:**
- Consumes: the scaffold from Task 3.
- Produces: `db` (Drizzle client) and the 14 financial table objects, importable as `@/lib/db` and `@/lib/db/schema`. Plan B's moved code imports exactly these names, unchanged from the hub: `financialCategories`, `financialSubcategories`, `financialEntities`, `financialAccounts`, `financialStatements`, `financialTransactions`, `transactionSplits`, `financialAssumptions`, `parseErrors`, `atoCodes`, `invoiceTags`, `exportJobs`, `invoiceSuppliers`, `invoices`.

- [ ] **Step 1: Copy the DB client verbatim from the hub**

Create `src/lib/db/index.ts`:

```ts
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)

export const db = drizzle(sql, { schema })
```

- [ ] **Step 2: Write the failing ownership test**

Create `src/lib/db/__tests__/ownership.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import * as schema from '@/lib/db/schema'
import { getTableName, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'

/**
 * AC-004 — this app owns exactly 19 tables and must declare no others.
 * Adding a hub table here is the failure mode this guards against.
 */
const OWNED = [
  'financial_categories', 'financial_subcategories', 'financial_entities',
  'financial_accounts', 'financial_statements', 'financial_transactions',
  'transaction_splits', 'financial_assumptions', 'parse_errors', 'ato_codes',
  'invoice_tags', 'export_jobs', 'invoice_suppliers', 'invoices',
  'bf_profiles', 'bf_accounts', 'bf_sessions', 'bf_verification_tokens',
  'bf_app_settings',
].sort()

describe('table ownership', () => {
  it('declares exactly the 19 owned tables', () => {
    const declared = Object.values(schema)
      .filter((v): v is PgTable => is(v, PgTable))
      .map(getTableName)
      .sort()
    expect(declared).toEqual(OWNED)
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npx vitest run src/lib/db/__tests__/ownership.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/db/schema'`, because it does not exist yet.

- [ ] **Step 4: Create the schema with the 14 financial tables**

Copy the 14 table definitions **verbatim** from
`C:/Users/MagedBoctor/orca/family-action-hub/src/lib/db/schema.ts`, together with the
`relations()` blocks that reference only these tables. Start the file with the same
imports the hub uses:

```ts
import {
  pgTable, uuid, text, timestamp, boolean, integer, real, jsonb,
  numeric, date, uniqueIndex, index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
```

Two changes from the hub's copy, and only two:

1. `exportJobs.requestedBy` is `text('requested_by')` — Task 1 already made this true in the database.
2. Drop any `relations()` entry pointing at a hub table.

The `bf_*` tables come in Task 5 — the ownership test stays red until then.

- [ ] **Step 5: Verify the schema matches the live database**

```bash
cd "C:/Users/MagedBoctor/orca/boctor-financials"
npx drizzle-kit check
```

Then confirm a real read works against live data:

```bash
node -e "
require('dotenv').config({path:'.env.local'});
const {neon}=require('@neondatabase/serverless');
const sql=neon(process.env.DATABASE_URL);
sql\`SELECT count(*) FROM financial_transactions\`.then(r=>console.log('transactions:',r));
sql\`SELECT count(*) FROM financial_entities\`.then(r=>console.log('entities:',r));
"
```

Expected: non-zero counts matching what the hub reports for the same query.

- [ ] **Step 6: Stage**

```bash
git add src/lib/db && git status --short
```

Do not commit — Task 5 completes the schema and the ownership test goes green there.

---

## Task 5: NextAuth over `bf_*` tables

**Files:**
- Modify: `src/lib/db/schema.ts` (append the 5 `bf_*` tables)
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/app/login/page.tsx`
- Create: `.env.local`

**Interfaces:**
- Consumes: `db` and the schema from Task 4.
- Produces: `auth`, `handlers`, `signIn`, `signOut` from `@/lib/auth`. Plan B's moved API routes call `await auth()` and read `session.user.id` / `session.user.email` / `(session.user as any).role`, exactly as in the hub.

- [ ] **Step 1: Append the `bf_*` tables to the schema**

Mirrors the hub's `profiles` / `accounts` / `sessions` / `verification_tokens`, renamed
and with `bf_app_settings` added:

```ts
// =====================
// Auth — this app's own NextAuth tables. Deliberately separate from the hub's
// (D3): independent Google grant, so one revoked token cannot take out both apps.
// =====================

export const bfProfiles = pgTable('bf_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  emailVerified: timestamp('email_verified'),
  image: text('image'),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Auth.js required tables (snake_case property names for adapter compatibility)
export const bfAccounts = pgTable('bf_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => bfProfiles.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
})

export const bfSessions = pgTable('bf_sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => bfProfiles.id, { onDelete: 'cascade' }),
  expires: timestamp('expires').notNull(),
})

export const bfVerificationTokens = pgTable('bf_verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull().unique(),
  expires: timestamp('expires').notNull(),
})

// Key-value admin config — this app's own, never the hub's app_settings (S2).
export const bfAppSettings = pgTable('bf_app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value'),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: text('updated_by'),
})
```

Note `bfAppSettings.updatedBy` is `text`, not a FK — the same severance principle as S1.

- [ ] **Step 2: Run the ownership test and watch it pass**

```bash
npx vitest run src/lib/db/__tests__/ownership.test.ts
```

Expected: PASS — all 19 tables now declared.

- [ ] **Step 3: Create `.env.local`**

```
DATABASE_URL=              # same Neon URL as family-action-hub
AUTH_SECRET=               # generate: npx auth secret
AUTH_URL=http://localhost:3007
GOOGLE_CLIENT_ID=          # same client as the hub
GOOGLE_CLIENT_SECRET=      # same client as the hub
ANTHROPIC_API_KEY=
GDRIVE_FINANCIALS_FOLDER_ID=
BLOB_READ_WRITE_TOKEN=
```

Copy the values from `family-action-hub/.env.local` except `AUTH_SECRET` (generate a
new one) and `AUTH_URL` (port 3007). Confirm `.env.local` is gitignored before continuing:
`git check-ignore -v .env.local`.

- [ ] **Step 4: Create `src/lib/auth.ts`**

Mirrors the hub's, over `bf_*` tables. The Drive and Gmail scopes are both required —
Drive for statement/invoice ingest, Gmail for the invoice scanner.

```ts
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/lib/db'
import { bfProfiles, bfAccounts, bfSessions, bfVerificationTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: bfProfiles,
    accountsTable: bfAccounts,
    sessionsTable: bfSessions,
    verificationTokensTable: bfVerificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
        const profile = await db
          .select({ role: bfProfiles.role })
          .from(bfProfiles)
          .where(eq(bfProfiles.id, user.id))
          .limit(1)
        ;(session.user as any).role = profile[0]?.role || 'member'
      }
      return session
    },
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.id) {
        const all = await db.select({ id: bfProfiles.id }).from(bfProfiles).limit(2)
        if (all.length <= 1) {
          await db.update(bfProfiles).set({ role: 'admin' }).where(eq(bfProfiles.id, user.id))
        }
        if (account.access_token) {
          await db.update(bfAccounts).set({
            access_token: account.access_token,
            refresh_token: account.refresh_token || undefined,
            expires_at: account.expires_at || undefined,
            scope: account.scope || undefined,
          }).where(eq(bfAccounts.providerAccountId, account.providerAccountId))
        }
      }
      return true
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'database' },
})
```

- [ ] **Step 5: Create the route handler and login page**

`src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from '@/lib/auth'
export const { GET, POST } = handlers
```

`src/app/login/page.tsx`:

```tsx
import { signIn } from '@/lib/auth'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <form
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: '/' })
        }}
      >
        <button type="submit" className="rounded-md border px-4 py-2">
          Sign in with Google
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 6: Create the `bf_*` tables in the database**

These are brand-new tables holding no data, so `push` is safe here — the v0.4.2
"guarded SQL only" rule exists to protect *existing* data.

```bash
npx drizzle-kit push
```

Review the printed plan before confirming. It must create only the five `bf_*` tables
and alter nothing else. **If it proposes any change to a `financial_*`, `invoice*`,
`ato_codes`, `parse_errors`, `export_jobs` or `transaction_splits` table, abort** — that
means the schema copy in Task 4 drifted from the live database.

- [ ] **Step 7: Register the localhost redirect URI**

In Google Cloud Console, on the same OAuth client the hub uses, add:

```
http://localhost:3007/api/auth/callback/google
```

This is a manual step for the user — the console cannot be scripted here.

- [ ] **Step 8: Verify sign-in end to end (AC-001)**

```bash
npm run dev -- -p 3007
```

Sign in at `http://localhost:3007/login`, then confirm the grant landed:

```bash
node -e "
require('dotenv').config({path:'.env.local'});
const {neon}=require('@neondatabase/serverless');
const sql=neon(process.env.DATABASE_URL);
sql\`SELECT email, role FROM bf_profiles\`.then(r=>console.log('profile:',r));
sql\`SELECT provider, scope, (refresh_token IS NOT NULL) AS has_refresh FROM bf_accounts\`
  .then(r=>console.log('grant:',r));
sql\`SELECT count(*) FROM bf_sessions\`.then(r=>console.log('sessions:',r));
"
```

Expected: one profile with `role = 'admin'`, one grant with `has_refresh = true` and a
scope string containing **both** `gmail.readonly` and `drive.readonly`, one session.

- [ ] **Step 9: Confirm the hub is unaffected**

```bash
cd "C:/Users/MagedBoctor/orca/family-action-hub" && npm run scan:health 2>&1 | head -12
```

Expected: still `[HEALTHY]`. The new grant must not have disturbed the hub's.

- [ ] **Step 10: Stage**

```bash
cd "C:/Users/MagedBoctor/orca/boctor-financials" && git add -A && git status --short
```

Suggested message: `feat(auth): NextAuth over bf_* tables with Drive + Gmail scopes [v0.1.0]`

---

## Task 6: Deploy, verify, hand off

**Files:**
- Create: `src/app/page.tsx` (placeholder home proving auth + DB read)
- Create: `docs/deployment.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a live production URL, and the trigger to move to the Plan B session.

- [ ] **Step 1: Write the placeholder home page**

Proves auth and a real read against live financial data in one screen.

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { financialTransactions, financialEntities } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

export default async function Home() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [txn] = await db.select({ n: sql<number>`count(*)` }).from(financialTransactions)
  const [ent] = await db.select({ n: sql<number>`count(*)` }).from(financialEntities)

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Boctor Financials</h1>
      <p className="text-sm text-neutral-600">
        Signed in as {session.user.email}. Foundation is live; features arrive in Plan B.
      </p>
      <div className="rounded-2xl border p-5">
        <p>{txn.n} transactions · {ent.n} entities</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify locally**

```bash
npm run dev -- -p 3007
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3007/
```

Expected: 307 to `/login` when signed out; 200 showing counts when signed in. The counts
must match what the hub reports for the same tables — that is AC-002 in miniature.

- [ ] **Step 3: Full local gate**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

Expected: all pass. The ownership and any other tests green, tsc exit 0, build clean.

- [ ] **Step 4: Create the Vercel project and set env vars**

Link the repo to a new Vercel project named `boctor-financials`. Set every variable from
`.env.local` in **Production**, with `AUTH_URL` set to the Vercel production URL rather
than localhost.

- [ ] **Step 5: Add the production redirect URI**

In Google Cloud Console, add `https://<production-url>/api/auth/callback/google` to the
same OAuth client. Manual user step.

- [ ] **Step 6: Deploy and verify**

Push to `master` to trigger the deploy, then:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://<production-url>/login
curl -s -o /dev/null -w "HTTP %{http_code} -> %{redirect_url}\n" https://<production-url>/
```

Expected: `/login` 200; `/` 307 to `/login`. Then sign in in a browser and confirm the
counts render.

- [ ] **Step 7: Write `docs/deployment.md`**

Mirror the hub's structure: environment variable table, the shared-database ownership
rule, and — prominently — the standing hazard that rotating `GOOGLE_CLIENT_SECRET` now
requires re-consenting **both** apps.

- [ ] **Step 8: Record the plan outcome and hand off**

Update this plan's checkboxes, then tell the user:

> Plan A complete. `boctor-financials` is deployed, signed into, and reading live
> financial data. **Add `C:/Users/MagedBoctor/orca/boctor-financials` to Orca as a new
> project and start a session there** — Plan B (the 16,633 LOC parity move) runs in that
> session, with the spec and this plan already in its `docs/features/`.

---

## Self-Review

**Spec coverage:**

| Spec item | Covered by |
|---|---|
| S1 severance | Task 1 |
| S2 (`bf_app_settings`) | Task 5 Step 1 — table created; the `isClaudeAtoEnabled` rewrite belongs to Plan B, which moves that code |
| D1 shared DB, disjoint ownership | Task 4 + ownership test |
| D3 own auth tables and grant | Task 5 |
| D5 both checkouts, mitigations | Task 2 + `CLAUDE.md` in Task 3 |
| D6 naming | Task 2 |
| §6 Drive + Gmail scopes | Task 5 Steps 4, 8 |
| §8 local workspace bootstrap | Tasks 2, 3 |
| AC-001 sign-in and grant | Task 5 Step 8 |
| AC-004 touches only owned tables | Task 4 ownership test |
| AC-005 no crossing FK | Task 1 boundary test |
| AC-002, AC-003, AC-006, AC-008 | **Plan B / C** — they require the moved feature code |
| AC-007 fresh clone works | Tasks 2, 3 |

**Gaps found and resolved:** AC-002/003/006/008 have no task here and correctly belong to
later plans; recorded above rather than left silent. `docs/superpowers/plans/` is
gitignored in this repo, so this plan lives in `docs/features/` per project convention.

**Type consistency:** `exportJobs.requestedBy` is `text` in Task 1 and in Task 4's copy.
`bfProfiles`/`bfAccounts`/`bfSessions`/`bfVerificationTokens` are named identically in
Tasks 4 (test), 5 (schema) and 5 (auth.ts). Table-name strings in the ownership test
match the `pgTable()` first arguments exactly.

**Placeholder scan:** none. The two genuinely manual steps (Google Console redirect URIs,
Vercel project creation) are marked as user actions rather than described vaguely.
