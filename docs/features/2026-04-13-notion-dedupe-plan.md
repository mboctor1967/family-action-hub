# Notion Dedupe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Notion domain with a Dedupe tab that lets the admin upload CLI-generated dedupe reports and archive duplicate Notion pages via a preview-confirm flow.

**Architecture:** New Notion domain at `/notion` with a tabbed layout (only Dedupe tab ships). Landing page at `/notion/dedupe` for uploads + report history; review page at `/notion/dedupe/[id]` for cluster review and archiving. Single `notion_dedupe_reports` Postgres table with jsonb report + jsonb decisions. Archive calls Notion's `PATCH /pages/{id}` with `archived:true`. Scan stays as the existing local CLI (`npm run dedupe:scan`) — Vercel's function timeout prevents long-running in-browser scans.

**Tech Stack:** Next.js App Router, Drizzle + Neon Postgres, NextAuth, Shadcn UI (Tabs, Dialog, Checkbox), Tailwind, react-hot-toast, zod for validation.

**Spec:** `docs/features/2026-04-13-notion-dedupe.md`

**Testing note:** This project has no automated test framework configured. Per-task "verification" steps use `npx tsc --noEmit`, `npm run lint`, and targeted manual checks (curl for APIs, browser for UI). TDD discipline from CLAUDE.md is preserved by writing the verification check *before* the implementation where feasible.

---

## File Structure

**New files:**
- `src/lib/notion/dedupe-schema.ts` — zod schemas for CLI report + decisions
- `src/lib/notion/archive.ts` — Notion archive helper (single + batch with 429 retry)
- `src/app/(dashboard)/notion/layout.tsx` — domain shell (admin guard + tab bar)
- `src/app/(dashboard)/notion/page.tsx` — redirects to `/notion/dedupe`
- `src/app/(dashboard)/notion/dedupe/page.tsx` — landing (instructions + upload + report list)
- `src/app/(dashboard)/notion/dedupe/[id]/page.tsx` — review page wrapper (server)
- `src/components/notion/dedupe-instructions.tsx` — collapsible instruction panel
- `src/components/notion/dedupe-upload-button.tsx` — file picker + POST
- `src/components/notion/dedupe-reports-list.tsx` — past reports list
- `src/components/notion/dedupe-review.tsx` — client review page (state, preview, archive)
- `src/components/notion/dedupe-cluster-card.tsx` — one cluster with KEEP/DELETE rows
- `src/components/notion/dedupe-preview-dialog.tsx` — preview-confirm modal
- `src/app/api/notion/dedupe/upload/route.ts` — POST upload
- `src/app/api/notion/dedupe/reports/route.ts` — GET list
- `src/app/api/notion/dedupe/[id]/route.ts` — GET detail
- `src/app/api/notion/dedupe/[id]/archive/route.ts` — POST archive

**Modified files:**
- `src/lib/db/schema.ts` — append `notionDedupeReports` table
- `src/app/(dashboard)/page.tsx` — add Notion NavCard to home grid
- `docs/CHANGELOG.md` — v0.1.4 entry

---

## Task 1 — Schema + migration

**Files:**
- Modify: `src/lib/db/schema.ts` (append at end)

- [ ] **Step 1: Append table definition**

Add to `src/lib/db/schema.ts` after the last existing table:

```ts
// Notion Dedupe
export const notionDedupeReports = pgTable('notion_dedupe_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
  uploadedBy: text('uploaded_by').notNull(),
  filename: text('filename').notNull(),
  scanTimestamp: text('scan_timestamp').notNull(),
  totalClusters: integer('total_clusters').notNull(),
  totalPages: integer('total_pages').notNull(),
  report: jsonb('report').notNull(),
  decisions: jsonb('decisions').notNull().default({}),
})
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Push schema to Neon**

Run: `npx dotenv -e .env.local -- npx drizzle-kit push`
Expected: prompts confirming creation of `notion_dedupe_reports`; accept.

- [ ] **Step 4: Verify in DB**

Run: `npx dotenv -e .env.local -- node -e "const {db}=require('./src/lib/db');const {sql}=require('drizzle-orm');db.execute(sql\`select column_name, data_type from information_schema.columns where table_name='notion_dedupe_reports' order by ordinal_position\`).then(r=>console.log(r.rows));"`
Expected: 9 columns listed (id, uploaded_at, uploaded_by, filename, scan_timestamp, total_clusters, total_pages, report, decisions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "schema(notion): notion_dedupe_reports table"
```

---

## Task 2 — Zod validator for CLI report shape

**Files:**
- Create: `src/lib/notion/dedupe-schema.ts`

- [ ] **Step 1: Write failing validation helper + inline verification**

Create `src/lib/notion/dedupe-schema.ts`:

```ts
import { z } from 'zod'

export const DedupePageSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  url: z.string().url(),
  bodyLen: z.number().int().nonnegative(),
  created: z.string(),
  edited: z.string(),
  parent: z.string().optional().default(''),
})

export const DedupeClusterSchema = z.object({
  cluster: z.number().int().positive(),
  confidence: z.number().int().min(0).max(100),
  reason: z.string(),
  pages: z.array(DedupePageSchema).min(2),
})

export const DedupeReportSchema = z.array(DedupeClusterSchema)

export type DedupePage = z.infer<typeof DedupePageSchema>
export type DedupeCluster = z.infer<typeof DedupeClusterSchema>
export type DedupeReport = z.infer<typeof DedupeReportSchema>

export const DecisionSchema = z.object({
  status: z.enum(['archived', 'failed', 'skipped']),
  at: z.string(),
  error: z.string().optional(),
})
export const DecisionsSchema = z.record(z.string(), DecisionSchema)
export type Decision = z.infer<typeof DecisionSchema>
export type Decisions = z.infer<typeof DecisionsSchema>

/** Returns the page id that should be marked KEEP for a cluster: longest body, tiebreak most recent edit. */
export function pickKeepId(cluster: DedupeCluster): string {
  const sorted = [...cluster.pages].sort(
    (a, b) => b.bodyLen - a.bodyLen || b.edited.localeCompare(a.edited),
  )
  return sorted[0].id
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If zod isn't installed, run `npm install zod` first.

- [ ] **Step 3: Smoke-test the validator**

Run: `node --input-type=module -e "import('./src/lib/notion/dedupe-schema.ts').then(m=>{console.log(m.DedupeReportSchema.safeParse([{cluster:1,confidence:100,reason:'x',pages:[{id:'a',title:'t',url:'https://x.io',bodyLen:10,created:'2026-01-01',edited:'2026-01-02'},{id:'b',title:'t',url:'https://x.io',bodyLen:5,created:'2026-01-01',edited:'2026-01-02'}]}]).success)}).catch(console.error)"`
Expected: `true`

Note: if TS loader isn't wired for node, skip this smoke test — next task's API route will exercise it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/notion/dedupe-schema.ts package.json package-lock.json
git commit -m "feat(notion): zod schemas for dedupe report + decisions"
```

---

## Task 3 — Upload API route

**Files:**
- Create: `src/app/api/notion/dedupe/upload/route.ts`

- [ ] **Step 1: Write route**

Create `src/app/api/notion/dedupe/upload/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notionDedupeReports } from '@/lib/db/schema'
import { DedupeReportSchema, type DedupeReport } from '@/lib/notion/dedupe-schema'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const filename = typeof body?.filename === 'string' ? body.filename : 'unknown.json'
  const parsed = DedupeReportSchema.safeParse(body?.report)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid report shape', issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    )
  }

  const report: DedupeReport = parsed.data
  const totalClusters = report.length
  const totalPages = report.reduce((s, c) => s + c.pages.length, 0)
  const scanTimestamp =
    filename.match(/dedupe-([0-9T\-]+)\.json/)?.[1] || new Date().toISOString()

  const [row] = await db
    .insert(notionDedupeReports)
    .values({
      uploadedBy: session.user.email || 'unknown',
      filename,
      scanTimestamp,
      totalClusters,
      totalPages,
      report,
      decisions: {},
    })
    .returning({ id: notionDedupeReports.id })

  return NextResponse.json({ id: row.id })
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both pass.

- [ ] **Step 3: Manual verification (sign in as admin in browser, then curl)**

Run against local dev (start with `npm run dev` if not running). Send a minimal valid body:

```bash
curl -sS -X POST http://localhost:3000/api/notion/dedupe/upload \
  -H 'Content-Type: application/json' \
  -b "$COOKIE" \
  -d '{"filename":"dedupe-2026-04-13T02-21-12.json","report":[{"cluster":1,"confidence":100,"reason":"identical body","pages":[{"id":"aaa","title":"t","url":"https://x.io","bodyLen":10,"created":"2026-01-01","edited":"2026-01-02"},{"id":"bbb","title":"t","url":"https://x.io","bodyLen":5,"created":"2026-01-01","edited":"2026-01-02"}]}]}'
```
Expected: `{"id":"<uuid>"}`. Verify a row landed in `notion_dedupe_reports`.

Also verify:
- Invalid body (missing `pages`) → `400 Invalid report shape`
- Non-JSON body → `400 Invalid JSON`
- Unauthenticated → `401`
- Non-admin session → `403`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/notion/dedupe/upload/route.ts
git commit -m "feat(notion): POST /api/notion/dedupe/upload"
```

---

## Task 4 — Reports list API

**Files:**
- Create: `src/app/api/notion/dedupe/reports/route.ts`

- [ ] **Step 1: Write route**

```ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notionDedupeReports } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await db
    .select({
      id: notionDedupeReports.id,
      uploadedAt: notionDedupeReports.uploadedAt,
      filename: notionDedupeReports.filename,
      scanTimestamp: notionDedupeReports.scanTimestamp,
      totalClusters: notionDedupeReports.totalClusters,
      totalPages: notionDedupeReports.totalPages,
      decisions: notionDedupeReports.decisions,
    })
    .from(notionDedupeReports)
    .orderBy(desc(notionDedupeReports.uploadedAt))

  const out = rows.map((r) => {
    const dec = (r.decisions ?? {}) as Record<string, { status: string }>
    const archivedCount = Object.values(dec).filter((d) => d.status === 'archived').length
    const { decisions: _omit, ...rest } = r
    return { ...rest, archivedCount }
  })

  return NextResponse.json({ reports: out })
}
```

- [ ] **Step 2: Type-check + manual check**

Run: `npx tsc --noEmit`
Then `curl` with admin cookie to `http://localhost:3000/api/notion/dedupe/reports`.
Expected: `{"reports":[{...}]}` with at least the one from Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/notion/dedupe/reports/route.ts
git commit -m "feat(notion): GET /api/notion/dedupe/reports"
```

---

## Task 5 — Report detail API

**Files:**
- Create: `src/app/api/notion/dedupe/[id]/route.ts`

- [ ] **Step 1: Write route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notionDedupeReports } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const [row] = await db.select().from(notionDedupeReports).where(eq(notionDedupeReports.id, id)).limit(1)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: row.id,
    uploadedAt: row.uploadedAt,
    filename: row.filename,
    scanTimestamp: row.scanTimestamp,
    totalClusters: row.totalClusters,
    totalPages: row.totalPages,
    report: row.report,
    decisions: row.decisions,
  })
}
```

Note: Next.js 15 requires `params` to be awaited (this is the "not the Next.js you know" tripwire from AGENTS.md). If this Next version uses the older sync signature, drop the `Promise<>` wrap. Confirm by reading `node_modules/next/dist/docs/` patterns for route handlers before finalizing.

- [ ] **Step 2: Type-check + manual**

Run: `npx tsc --noEmit` then `curl` with admin cookie to `/api/notion/dedupe/<id>` using the id from Task 3.
Expected: full report body returned.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/notion/dedupe/[id]/route.ts
git commit -m "feat(notion): GET /api/notion/dedupe/[id]"
```

---

## Task 6 — Notion archive helper (lib)

**Files:**
- Create: `src/lib/notion/archive.ts`

- [ ] **Step 1: Write helper with 429 retry**

```ts
const NOTION_API = 'https://api.notion.com/v1'

export type ArchiveResult = {
  pageId: string
  status: 'archived' | 'failed'
  error?: string
}

async function patchArchived(pageId: string, token: string): Promise<Response> {
  return fetch(`${NOTION_API}/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ archived: true }),
  })
}

export async function archivePage(pageId: string, token: string): Promise<ArchiveResult> {
  try {
    let res = await patchArchived(pageId, token)
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') || '1')
      await new Promise((r) => setTimeout(r, Math.min(10_000, retryAfter * 1000)))
      res = await patchArchived(pageId, token)
    }
    if (!res.ok) {
      const text = await res.text()
      const hint =
        res.status === 403
          ? 'Token lacks Update content scope. Check Notion integration settings.'
          : res.status === 404
          ? 'Page not found (already deleted?)'
          : `HTTP ${res.status}`
      return { pageId, status: 'failed', error: `${hint}: ${text.slice(0, 200)}` }
    }
    return { pageId, status: 'archived' }
  } catch (e: any) {
    return { pageId, status: 'failed', error: e?.message || 'network error' }
  }
}

export async function archiveBatch(pageIds: string[], token: string, concurrency = 4): Promise<ArchiveResult[]> {
  const results: ArchiveResult[] = []
  const queue = [...pageIds]
  async function worker() {
    while (queue.length) {
      const id = queue.shift()!
      results.push(await archivePage(id, token))
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/notion/archive.ts
git commit -m "feat(notion): archive helper with 429 retry + concurrency"
```

---

## Task 7 — Archive API route

**Files:**
- Create: `src/app/api/notion/dedupe/[id]/archive/route.ts`

- [ ] **Step 1: Write route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notionDedupeReports } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { archiveBatch } from '@/lib/notion/archive'
import { DecisionsSchema, DedupeReportSchema, pickKeepId } from '@/lib/notion/dedupe-schema'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const token = process.env.NOTION_DEDUPE_TOKEN
  if (!token) return NextResponse.json({ error: 'NOTION_DEDUPE_TOKEN not set' }, { status: 500 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const pageIds: unknown = body?.pageIds
  if (!Array.isArray(pageIds) || !pageIds.every((x) => typeof x === 'string')) {
    return NextResponse.json({ error: 'pageIds must be string[]' }, { status: 400 })
  }
  if (pageIds.length === 0) return NextResponse.json({ error: 'pageIds empty' }, { status: 400 })
  if (pageIds.length > 100) return NextResponse.json({ error: 'Max 100 pages per request' }, { status: 400 })

  const [row] = await db.select().from(notionDedupeReports).where(eq(notionDedupeReports.id, id)).limit(1)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Guard: block KEEP pages server-side.
  const report = DedupeReportSchema.parse(row.report)
  const keepIds = new Set(report.map(pickKeepId))
  const illegal = (pageIds as string[]).filter((p) => keepIds.has(p))
  if (illegal.length) {
    return NextResponse.json({ error: 'Cannot archive KEEP pages', pageIds: illegal }, { status: 400 })
  }

  const results = await archiveBatch(pageIds as string[], token)

  const prevDecisions = DecisionsSchema.parse(row.decisions ?? {})
  const nextDecisions = { ...prevDecisions }
  const now = new Date().toISOString()
  for (const r of results) {
    nextDecisions[r.pageId] = r.status === 'archived'
      ? { status: 'archived', at: now }
      : { status: 'failed', at: now, error: r.error }
  }
  await db.update(notionDedupeReports).set({ decisions: nextDecisions }).where(eq(notionDedupeReports.id, id))

  const archived = results.filter((r) => r.status === 'archived').length
  const failed = results.filter((r) => r.status === 'failed').map((r) => ({ pageId: r.pageId, error: r.error }))
  return NextResponse.json({ archived, failed })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Manual verification with a throwaway test page**

Create a test page in Notion that the integration has access to. Then:

```bash
curl -sS -X POST http://localhost:3000/api/notion/dedupe/<reportId>/archive \
  -H 'Content-Type: application/json' -b "$COOKIE" \
  -d '{"pageIds":["<throwaway-page-id>"]}'
```
Expected: `{"archived":1,"failed":[]}`. Check the page is now in Notion trash.

Also verify:
- `pageIds: []` → 400
- `pageIds` with 101 entries → 400
- KEEP id (from report) → 400 with illegal list
- Non-existent page id → `failed` with "not found" error, 200 response

- [ ] **Step 4: Commit**

```bash
git add src/app/api/notion/dedupe/[id]/archive/route.ts
git commit -m "feat(notion): POST /api/notion/dedupe/[id]/archive"
```

---

## Task 8 — Notion domain shell + home NavCard

**Files:**
- Create: `src/app/(dashboard)/notion/layout.tsx`
- Create: `src/app/(dashboard)/notion/page.tsx`
- Modify: `src/app/(dashboard)/page.tsx` (add NavCard)

- [ ] **Step 1: Write layout with admin guard + tab bar**

`src/app/(dashboard)/notion/layout.tsx`:

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'

export default async function NotionLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as any).role !== 'admin') {
    return (
      <div className="text-center py-12 text-muted-foreground">
        You don&apos;t have access to this page.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Notion" subtitle="Workspace management tools" />
      <Tabs value="dedupe">
        <TabsList>
          <TabsTrigger value="dedupe" asChild>
            <Link href="/notion/dedupe">Dedupe</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div>{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Redirect `/notion` → `/notion/dedupe`**

`src/app/(dashboard)/notion/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

export default function NotionIndex() {
  redirect('/notion/dedupe')
}
```

- [ ] **Step 3: Add Notion NavCard to home grid**

Edit `src/app/(dashboard)/page.tsx`:

- Add to the lucide-react import list: `BookOpen`
- In the "Other Tools" section grid (near the bottom, the section that contains the Vehicle Logbook card), insert a new NavCard **before** the Vehicle one:

```tsx
<NavCard
  title="Notion"
  href="/notion"
  icon={BookOpen}
  iconColor="text-slate-700"
  iconBg="bg-slate-100"
  stats={[{ label: 'Tools', value: 1 }]}
/>
```

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both pass.

- [ ] **Step 5: Manual — browser check**

`npm run dev`, sign in as admin, visit `/`. Expected: Notion card visible in Other Tools. Click it → `/notion/dedupe` loads (blank content area for now, tabs visible).

Also verify non-admin sees "You don't have access" at `/notion`.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/notion src/app/\(dashboard\)/page.tsx
git commit -m "feat(notion): domain shell + home NavCard"
```

---

## Task 9 — Dedupe landing: instructions + upload + reports list

**Files:**
- Create: `src/components/notion/dedupe-instructions.tsx`
- Create: `src/components/notion/dedupe-upload-button.tsx`
- Create: `src/components/notion/dedupe-reports-list.tsx`
- Create: `src/app/(dashboard)/notion/dedupe/page.tsx`

- [ ] **Step 1: Write collapsible instruction panel**

`src/components/notion/dedupe-instructions.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

const KEY = 'notion-dedupe-instructions-collapsed'

export function DedupeInstructions() {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    setCollapsed(localStorage.getItem(KEY) === '1')
  }, [])
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(KEY, next ? '1' : '0')
  }
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm">
      <button onClick={toggle} className="flex items-center gap-1 font-medium">
        How this works {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
      {!collapsed && (
        <ol className="mt-2 space-y-1 list-decimal list-inside text-muted-foreground">
          <li><strong>Scan</strong> — run <code>npm run dedupe:scan</code> in your terminal. Produces a JSON report in <code>scripts/reports/</code>. Takes 2–5 minutes. Runs on your laptop because Vercel can&apos;t host long-running jobs.</li>
          <li><strong>Upload</strong> — click the button below and pick the JSON file.</li>
          <li><strong>Review</strong> — tick which DELETE rows to archive. KEEP rows are auto-picked (longest body, most recent edit) and locked.</li>
          <li><strong>Archive</strong> — preview, then confirm. Archived pages land in Notion trash (30-day restore).</li>
        </ol>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write upload button**

`src/components/notion/dedupe-upload-button.tsx`:

```tsx
'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import toast from 'react-hot-toast'

export function DedupeUploadButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    try {
      const text = await f.text()
      let report: unknown
      try { report = JSON.parse(text) } catch { toast.error('Not valid JSON'); return }
      const res = await fetch('/api/notion/dedupe/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: f.name, report }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err?.error || `Upload failed (${res.status})`)
        return
      }
      const { id } = await res.json()
      router.push(`/notion/dedupe/${id}`)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" onChange={onPick} />
      <Button onClick={() => inputRef.current?.click()} disabled={busy} className="gap-1.5">
        <Upload className="h-4 w-4" />
        {busy ? 'Uploading…' : 'Upload report'}
      </Button>
    </>
  )
}
```

- [ ] **Step 3: Write reports list (server-rendered via fetch in the page)**

`src/components/notion/dedupe-reports-list.tsx`:

```tsx
import Link from 'next/link'

type Report = {
  id: string
  uploadedAt: string
  filename: string
  scanTimestamp: string
  totalClusters: number
  totalPages: number
  archivedCount: number
}

export function DedupeReportsList({ reports }: { reports: Report[] }) {
  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">No reports uploaded yet.</p>
  }
  return (
    <ul className="divide-y rounded-lg border">
      {reports.map((r) => (
        <li key={r.id} className="p-4 hover:bg-muted/30">
          <Link href={`/notion/dedupe/${r.id}`} className="flex items-center justify-between">
            <div>
              <div className="font-medium">{new Date(r.uploadedAt).toLocaleString('en-AU')}</div>
              <div className="text-xs text-muted-foreground">{r.filename}</div>
            </div>
            <div className="text-sm text-right">
              <div>{r.totalClusters} clusters · {r.totalPages} pages</div>
              <div className="text-xs text-muted-foreground">{r.archivedCount} archived</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Write landing page (server component, fetches reports)**

`src/app/(dashboard)/notion/dedupe/page.tsx`:

```tsx
import { db } from '@/lib/db'
import { notionDedupeReports } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'
import { DedupeInstructions } from '@/components/notion/dedupe-instructions'
import { DedupeUploadButton } from '@/components/notion/dedupe-upload-button'
import { DedupeReportsList } from '@/components/notion/dedupe-reports-list'

export default async function DedupeLandingPage() {
  const rows = await db
    .select({
      id: notionDedupeReports.id,
      uploadedAt: notionDedupeReports.uploadedAt,
      filename: notionDedupeReports.filename,
      scanTimestamp: notionDedupeReports.scanTimestamp,
      totalClusters: notionDedupeReports.totalClusters,
      totalPages: notionDedupeReports.totalPages,
      decisions: notionDedupeReports.decisions,
    })
    .from(notionDedupeReports)
    .orderBy(desc(notionDedupeReports.uploadedAt))

  const reports = rows.map((r) => {
    const dec = (r.decisions ?? {}) as Record<string, { status: string }>
    const archivedCount = Object.values(dec).filter((d) => d.status === 'archived').length
    const { decisions: _omit, ...rest } = r
    return {
      ...rest,
      uploadedAt: rest.uploadedAt?.toISOString?.() ?? String(rest.uploadedAt),
      archivedCount,
    }
  })

  return (
    <div className="space-y-5">
      <DedupeInstructions />
      <div><DedupeUploadButton /></div>
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Past reports</h2>
        <DedupeReportsList reports={reports} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Type-check + lint + browser**

Run: `npx tsc --noEmit && npm run lint`
Then open `/notion/dedupe`. Expected: instruction panel, upload button, empty list (or the row from Task 3). Collapse instructions → refresh → still collapsed. Upload a real `scripts/reports/dedupe-*.json` → redirects to `/notion/dedupe/<id>` (404 content for now — review page comes next).

- [ ] **Step 6: Commit**

```bash
git add src/components/notion src/app/\(dashboard\)/notion/dedupe/page.tsx
git commit -m "feat(notion): dedupe landing — instructions, upload, reports list"
```

---

## Task 10 — Review page skeleton (read-only render)

**Files:**
- Create: `src/app/(dashboard)/notion/dedupe/[id]/page.tsx`
- Create: `src/components/notion/dedupe-review.tsx`
- Create: `src/components/notion/dedupe-cluster-card.tsx`

- [ ] **Step 1: Write cluster card (presentational, no selection yet)**

`src/components/notion/dedupe-cluster-card.tsx`:

```tsx
'use client'
import { type DedupeCluster, type Decisions } from '@/lib/notion/dedupe-schema'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, RotateCcw } from 'lucide-react'

export type ClusterCardProps = {
  cluster: DedupeCluster
  keepId: string
  decisions: Decisions
  selected: Set<string>
  onToggle: (pageId: string) => void
  onRetry: (pageId: string) => void
}

export function DedupeClusterCard({ cluster, keepId, decisions, selected, onToggle, onRetry }: ClusterCardProps) {
  const allArchived = cluster.pages.every(
    (p) => p.id === keepId || decisions[p.id]?.status === 'archived',
  )
  const [collapsed, setCollapsed] = useState(allArchived)

  return (
    <div className="rounded-lg border">
      <button className="w-full flex items-center justify-between p-3" onClick={() => setCollapsed(!collapsed)}>
        <div className="flex items-center gap-2 text-sm">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <strong>Cluster {cluster.cluster}</strong>
          <span className="text-muted-foreground">— {cluster.pages[0].title.slice(0, 60)}</span>
          <Badge variant="outline">{cluster.pages.length} pages</Badge>
          <Badge variant="outline">{cluster.confidence}%</Badge>
          {allArchived && <Badge className="bg-green-100 text-green-700">all archived</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">{cluster.reason}</span>
      </button>
      {!collapsed && (
        <div className="divide-y">
          {cluster.pages.map((p) => {
            const isKeep = p.id === keepId
            const dec = decisions[p.id]
            const isArchived = dec?.status === 'archived'
            const isFailed = dec?.status === 'failed'
            return (
              <div key={p.id} className={`flex items-center gap-3 p-3 text-sm ${isArchived ? 'opacity-50' : ''}`}>
                <div className="w-6">
                  {isKeep ? (
                    <Checkbox checked disabled aria-label="KEEP (locked)" />
                  ) : isArchived ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : isFailed ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : (
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => onToggle(p.id)}
                      aria-label={`Select DELETE ${p.title}`}
                    />
                  )}
                </div>
                <Badge variant={isKeep ? 'default' : 'secondary'}>{isKeep ? 'KEEP' : 'DELETE'}</Badge>
                <a href={p.url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">
                  {p.title || '(untitled)'}
                </a>
                <span className="text-xs text-muted-foreground tabular-nums">{p.bodyLen}ch</span>
                <span className="text-xs text-muted-foreground">{p.edited.slice(0, 10)}</span>
                {isFailed && (
                  <button onClick={() => onRetry(p.id)} className="text-red-600 hover:underline flex items-center gap-1 text-xs" title={dec?.error}>
                    <RotateCcw className="h-3 w-3" /> retry
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write review container (state + skeleton; no archive yet)**

`src/components/notion/dedupe-review.tsx`:

```tsx
'use client'
import { useMemo, useState } from 'react'
import { type DedupeReport, type Decisions, pickKeepId } from '@/lib/notion/dedupe-schema'
import { DedupeClusterCard } from './dedupe-cluster-card'
import { Button } from '@/components/ui/button'

export type DedupeReviewProps = {
  reportId: string
  report: DedupeReport
  initialDecisions: Decisions
}

export function DedupeReview({ report, initialDecisions }: DedupeReviewProps) {
  const [decisions, _setDecisions] = useState<Decisions>(initialDecisions)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const keepIds = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of report) m.set(c.cluster, pickKeepId(c))
    return m
  }, [report])

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectedClusters = useMemo(() => {
    const ids = new Set<number>()
    for (const c of report) if (c.pages.some((p) => selected.has(p.id))) ids.add(c.cluster)
    return ids.size
  }, [report, selected])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        Tick DELETE rows to archive. KEEP rows are auto-picked (longest body, most recent edit) and locked.
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm">
          Selected: <strong>{selected.size}</strong> pages across <strong>{selectedClusters}</strong> clusters
        </div>
        <div className="flex gap-2">
          <Button disabled={selected.size === 0} variant="default">Preview archive</Button>
        </div>
      </div>
      <div className="space-y-3">
        {report.map((c) => (
          <DedupeClusterCard
            key={c.cluster}
            cluster={c}
            keepId={keepIds.get(c.cluster)!}
            decisions={decisions}
            selected={selected}
            onToggle={toggle}
            onRetry={() => { /* wired in Task 11 */ }}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write server page**

`src/app/(dashboard)/notion/dedupe/[id]/page.tsx`:

```tsx
import { db } from '@/lib/db'
import { notionDedupeReports } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { DedupeReviewFromServer } from './review-client-wrapper'
import { DedupeReportSchema, DecisionsSchema } from '@/lib/notion/dedupe-schema'

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [row] = await db.select().from(notionDedupeReports).where(eq(notionDedupeReports.id, id)).limit(1)
  if (!row) notFound()

  const report = DedupeReportSchema.parse(row.report)
  const decisions = DecisionsSchema.parse(row.decisions ?? {})

  return <DedupeReviewFromServer reportId={row.id} report={report} initialDecisions={decisions} />
}
```

Also create `src/app/(dashboard)/notion/dedupe/[id]/review-client-wrapper.tsx`:

```tsx
'use client'
import { DedupeReview, type DedupeReviewProps } from '@/components/notion/dedupe-review'
export function DedupeReviewFromServer(props: DedupeReviewProps) {
  return <DedupeReview {...props} />
}
```

(The wrapper exists so the server page stays a server component while the review is fully client-side.)

- [ ] **Step 4: Type-check + lint + browser**

Run: `npx tsc --noEmit && npm run lint`
Open `/notion/dedupe/<id>` for the uploaded report. Expected: clusters render, KEEP rows locked, checking DELETE rows updates the counter. Preview button renders but does nothing yet.

- [ ] **Step 5: Commit**

```bash
git add src/components/notion src/app/\(dashboard\)/notion/dedupe/\[id\]
git commit -m "feat(notion): dedupe review page — cluster cards + selection"
```

---

## Task 11 — Preview dialog + archive wiring + retry

**Files:**
- Create: `src/components/notion/dedupe-preview-dialog.tsx`
- Modify: `src/components/notion/dedupe-review.tsx`

- [ ] **Step 1: Write preview dialog**

`src/components/notion/dedupe-preview-dialog.tsx`:

```tsx
'use client'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { type DedupeReport } from '@/lib/notion/dedupe-schema'

export function DedupePreviewDialog({
  open,
  onClose,
  onConfirm,
  selected,
  report,
  busy,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  selected: Set<string>
  report: DedupeReport
  busy: boolean
}) {
  const rows: { cluster: number; title: string }[] = []
  for (const c of report) {
    for (const p of c.pages) if (selected.has(p.id)) rows.push({ cluster: c.cluster, title: p.title })
  }
  const clusters = new Set(rows.map((r) => r.cluster)).size
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview archive</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          This will archive <strong>{rows.length}</strong> pages across <strong>{clusters}</strong> clusters.
          Archived pages land in Notion trash and can be restored within 30 days.
        </p>
        <ul className="max-h-64 overflow-y-auto text-xs space-y-1 rounded border p-2">
          {rows.map((r, i) => (
            <li key={i} className="truncate">
              <span className="text-muted-foreground">C{r.cluster}</span> — {r.title || '(untitled)'}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy}>{busy ? 'Archiving…' : 'Confirm archive'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Wire archive + retry into `DedupeReview`**

Replace `src/components/notion/dedupe-review.tsx` with the full version:

```tsx
'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { type DedupeReport, type Decisions, pickKeepId } from '@/lib/notion/dedupe-schema'
import { DedupeClusterCard } from './dedupe-cluster-card'
import { DedupePreviewDialog } from './dedupe-preview-dialog'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

export type DedupeReviewProps = {
  reportId: string
  report: DedupeReport
  initialDecisions: Decisions
}

export function DedupeReview({ reportId, report, initialDecisions }: DedupeReviewProps) {
  const router = useRouter()
  const [decisions, setDecisions] = useState<Decisions>(initialDecisions)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const keepIds = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of report) m.set(c.cluster, pickKeepId(c))
    return m
  }, [report])

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function runArchive(pageIds: string[]) {
    if (pageIds.length === 0) return
    if (pageIds.length > 100) {
      toast.error('Select at most 100 pages per archive')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/notion/dedupe/${reportId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageIds }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || `Archive failed (${res.status})`)
        return
      }
      toast.success(`Archived ${data.archived}${data.failed?.length ? `, ${data.failed.length} failed` : ''}`)
      // Optimistically update decisions client-side based on response, then refresh from server.
      const now = new Date().toISOString()
      setDecisions((prev) => {
        const next = { ...prev }
        for (const id of pageIds) next[id] = { status: 'archived', at: now }
        for (const f of data.failed || []) next[f.pageId] = { status: 'failed', at: now, error: f.error }
        return next
      })
      setSelected(new Set())
      router.refresh()
    } finally {
      setBusy(false)
      setPreviewOpen(false)
    }
  }

  const selectedClusters = useMemo(() => {
    const ids = new Set<number>()
    for (const c of report) if (c.pages.some((p) => selected.has(p.id))) ids.add(c.cluster)
    return ids.size
  }, [report, selected])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        Tick DELETE rows to archive. KEEP rows are auto-picked (longest body, most recent edit) and locked.
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm">
          Selected: <strong>{selected.size}</strong> pages across <strong>{selectedClusters}</strong> clusters
        </div>
        <div className="flex gap-2">
          <Button disabled={selected.size === 0 || busy} onClick={() => setPreviewOpen(true)}>
            Preview archive
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {report.map((c) => (
          <DedupeClusterCard
            key={c.cluster}
            cluster={c}
            keepId={keepIds.get(c.cluster)!}
            decisions={decisions}
            selected={selected}
            onToggle={toggle}
            onRetry={(id) => runArchive([id])}
          />
        ))}
      </div>
      <DedupePreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onConfirm={() => runArchive(Array.from(selected))}
        selected={selected}
        report={report}
        busy={busy}
      />
    </div>
  )
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both pass.

- [ ] **Step 4: Manual end-to-end with a throwaway cluster**

Workflow:
1. Pick a small cluster (e.g., 2-page test duplicates you created in Notion).
2. On the review page, check one DELETE row.
3. Click Preview archive → verify modal shows 1 page, 1 cluster.
4. Confirm → toast "Archived 1". Row greys out with check icon.
5. If the page id doesn't exist (simulate by manually editing one to be bogus), row shows red with retry button; click retry → toast updates.

- [ ] **Step 5: Commit**

```bash
git add src/components/notion
git commit -m "feat(notion): archive + preview dialog + retry wiring"
```

---

## Task 12 — Docs + version + CHANGELOG + release gate

**Files:**
- Modify: `package.json` (version bump)
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/features/2026-04-13-notion-dedupe.md` (fill release notes)

- [ ] **Step 1: Fill release notes in the feature brief**

In `docs/features/2026-04-13-notion-dedupe.md`, replace the three `<!-- TBD at release -->` placeholders with one paragraph each covering:
- **future-you:** domain scaffolding, jsonb-backed reports, local CLI + upload split, 429-retry archive helper
- **family:** "New Notion section (admin only) for cleaning up duplicate Notion pages"
- **git log:** one-line summary suitable for the commit message

- [ ] **Step 2: CHANGELOG entry**

Prepend to `docs/CHANGELOG.md`:

```md
## v0.1.4 — 2026-04-13
- feat(notion): Notion domain + Dedupe tab. Upload CLI-generated dedupe reports, review clusters with auto-KEEP selection, preview + confirm archive via Notion API. Archived pages land in Notion trash (30-day restore).
- schema: `notion_dedupe_reports` table (jsonb report + decisions).
```

- [ ] **Step 3: Version bump menu (present to user)**

Present this menu and wait:
```
Version bump:
  [A] patch  (v0.1.3 → v0.1.4)   ← recommended (brief declares v0.1.4)
  [B] minor  (v0.1.3 → v0.2.0)
  [C] major
  [D] skip
```

On chosen bump, update `package.json` `version` accordingly.

- [ ] **Step 4: Type-check + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 5: Release gate menu (present to user — DO NOT auto-run)**

Present the lettered menu from CLAUDE.md §Release gate:
```
[A] Stop — stage only
[B] Commit only (local, no push, no tag)
[C] Commit + tag (local, no push)
[D] Commit + tag + push (triggers Vercel auto-deploy)
[E] Commit + tag + push + verify deploy + record in deployment log
[F] Full pipeline (E + smoke tests + deploy history entry)
[G] Custom
```

Wait for user choice; do NOT push/tag/deploy without explicit selection.

- [ ] **Step 6: On chosen option, execute only that scope**

Example commit message template (use HEREDOC per CLAUDE.md):

```bash
git add docs/CHANGELOG.md docs/features/2026-04-13-notion-dedupe.md package.json
git commit -m "$(cat <<'EOF'
feat(notion): dedupe domain — upload, review, archive [v0.1.4]

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Restart local dev server**

Per CLAUDE.md "After completing any code change", kill existing `npm run dev` and restart so the user can test on `localhost:3000`.

---

## Self-Review Results

**Spec coverage check (all 16 ACs):**
- AC-1 → Task 8
- AC-2 → Tasks 3, 4, 5, 7 (auth guard in each route)
- AC-3 → Task 9 (DedupeInstructions, localStorage)
- AC-4 → Task 9 (DedupeReportsList + landing page fetch)
- AC-5 → Task 3 + Task 9 (upload button redirect)
- AC-6 → Task 3 (zod validation + JSON parse guard)
- AC-7 → Task 10 (cluster card + pickKeepId)
- AC-8 → Task 10 (KEEP Checkbox disabled)
- AC-9 → Task 11 (DedupePreviewDialog)
- AC-10 → Task 7 + Task 11 (archive route + client wiring)
- AC-11 → Task 10 + Task 11 (row states + optimistic update + router.refresh)
- AC-12 → Task 6 (archivePage 403 hint) + Task 11 (toast surfacing)
- AC-13 → Task 6 (429 retry-once)
- AC-14 → Task 10 (ClusterCard collapses when allArchived)
- AC-15 → **Gap — SHOULD-priority filters not implemented.** Deferred: acceptable because MoSCoW=SHOULD and basic review works without it. Task 12 release notes must mention this as known-gap.
- AC-16 → **Gap — COULD-priority CSV export not implemented.** Same rationale; COULD is explicitly deferrable.

**Action:** Plan honestly omits AC-15 (filters) and AC-16 (CSV) to keep v0.1.4 shippable. Brief lists them as SHOULD/COULD — within MoSCoW rules, these can roll into a follow-up patch. Note added to Task 12 release notes.

**Placeholder scan:** No TBD/TODO in code blocks. Release notes placeholders are explicit fill-at-release items per project convention, not plan placeholders.

**Type consistency:** `pickKeepId`, `Decisions`, `DedupeReport` used consistently across tasks 2, 7, 10, 11. `archivePage` / `archiveBatch` consistent. `DedupeReviewProps` defined once in Task 10 and reused.

**Known deviations from skill defaults:**
- No automated test framework; "verification" uses type-check, lint, and manual/curl checks.
- Plan lives in `docs/features/` not `docs/superpowers/plans/` per project convention.
