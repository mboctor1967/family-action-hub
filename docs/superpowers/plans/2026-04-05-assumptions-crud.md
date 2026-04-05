# Assumptions CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CRUD page at `/financials/assumptions` for managing per-FY, per-entity financial assumptions with dialog-based create/edit, FY tabs, entity grouping, and copy-forward functionality.

**Architecture:** Server component page with admin auth wrapping a client component (`AssumptionsView`) that handles all interactivity. Four API routes (list+create, update+delete, copy). Schema migration to add unique index.

**Tech Stack:** Next.js App Router, Drizzle ORM (PostgreSQL), Shadcn UI (Dialog, Select, Input, Textarea, Table, Button, Tabs), react-hot-toast, Lucide icons. Shared components: PageHeader, StatCard, EmptyState, DataTableContainer.

**Spec:** `docs/superpowers/specs/2026-04-05-assumptions-crud-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/db/schema.ts` | Modify | Replace index with uniqueIndex on (fy, entityId, assumptionType) |
| `src/lib/assumptions.ts` | Create | Type catalogue, FY helpers, display formatters — shared between API and UI |
| `src/app/api/financials/assumptions/route.ts` | Create | GET (list with optional ?fy filter) + POST (create with uniqueness check) |
| `src/app/api/financials/assumptions/[id]/route.ts` | Create | PATCH (update with uniqueness re-check) + DELETE |
| `src/app/api/financials/assumptions/copy/route.ts` | Create | POST (copy all from source FY to target FY) |
| `src/app/(dashboard)/financials/assumptions/page.tsx` | Create | Server component — admin auth, render AssumptionsView |
| `src/components/financials/assumptions-view.tsx` | Create | Client component — FY tabs, stat cards, entity sections, dialog, copy button |
| `src/app/(dashboard)/page.tsx` | Modify | Remove `badge` and `disabled` from Assumptions NavCard |

---

## Task 1: Schema Migration — Add Unique Index

**Files:**
- Modify: `src/lib/db/schema.ts` (line ~370, the `financialAssumptions` table definition)

- [ ] **Step 1: Update schema to use uniqueIndex**

In `src/lib/db/schema.ts`, find the `financialAssumptions` table definition. Replace the existing index:
```typescript
index('idx_fin_assumptions_fy_entity').on(table.fy, table.entityId),
```
with:
```typescript
uniqueIndex('idx_fin_assumptions_fy_entity_type').on(table.fy, table.entityId, table.assumptionType),
```

Add the `uniqueIndex` import at the top if not already present — it comes from `drizzle-orm/pg-core`. Check the existing imports from that module and add `uniqueIndex` to the list.

- [ ] **Step 2: Generate migration**

Run:
```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub && npx drizzle-kit generate
```
Expected: Creates a new migration file in `./drizzle/` that drops the old index and creates the new unique one.

- [ ] **Step 3: Apply migration**

Run:
```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub && npx drizzle-kit push
```
Expected: Schema applied to database.

- [ ] **Step 4: Verify build**

Run:
```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub && npx next build 2>&1 | tail -5
```
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(assumptions): add unique index on (fy, entityId, assumptionType)"
```

---

## Task 2: Shared Types & Helpers

**Files:**
- Create: `src/lib/assumptions.ts`

- [ ] **Step 1: Create the assumptions helpers file**

Create `src/lib/assumptions.ts` with the type catalogue, FY helpers, and display formatters:

```typescript
// Assumption type catalogue
export const ASSUMPTION_TYPES = [
  { key: 'wfh_hours_per_week', label: 'WFH Hours/Week', valueType: 'numeric' as const, unit: 'hrs' },
  { key: 'home_office_method', label: 'Home Office Method', valueType: 'enum' as const, options: [
    { value: 'fixed_rate_67c', label: 'Fixed rate (67c/hr)' },
    { value: 'actual_cost', label: 'Actual cost' },
  ]},
  { key: 'home_office_floor_area_pct', label: 'Home Office Floor Area %', valueType: 'numeric' as const, unit: '%' },
  { key: 'phone_business_pct', label: 'Phone Business %', valueType: 'numeric' as const, unit: '%' },
  { key: 'internet_business_pct', label: 'Internet Business %', valueType: 'numeric' as const, unit: '%' },
  { key: 'vehicle_method', label: 'Vehicle Method', valueType: 'enum' as const, options: [
    { value: 'logbook', label: 'Logbook' },
    { value: 'cents_per_km', label: 'Cents per km' },
  ]},
  { key: 'vehicle_business_pct', label: 'Vehicle Business %', valueType: 'numeric' as const, unit: '%' },
  { key: 'utilities_business_pct', label: 'Utilities Business %', valueType: 'numeric' as const, unit: '%' },
  { key: 'entertainment_deductible_pct', label: 'Entertainment Deductible %', valueType: 'numeric' as const, unit: '%' },
] as const

export type AssumptionTypeKey = typeof ASSUMPTION_TYPES[number]['key']

/** Get the catalogue entry for a given assumption type key */
export function getAssumptionType(key: string) {
  return ASSUMPTION_TYPES.find((t) => t.key === key)
}

/** Format the display value for an assumption */
export function formatAssumptionValue(type: string, valueNumeric: string | null, valueText: string | null): string {
  const typeDef = getAssumptionType(type)
  if (!typeDef) return valueNumeric ?? valueText ?? '—'

  if (typeDef.valueType === 'enum') {
    const option = typeDef.options.find((o) => o.value === valueText)
    return option?.label ?? valueText ?? '—'
  }

  if (valueNumeric == null) return '—'
  return `${valueNumeric}${typeDef.unit === '%' ? '%' : ` ${typeDef.unit}`}`
}

/** Get the display label for an assumption type key */
export function getAssumptionLabel(key: string): string {
  return getAssumptionType(key)?.label ?? key
}

// Australian FY helpers (July 1 — June 30)

/** Get FY label for a date, e.g. "FY2026" (short form for the FY starting July 2025) */
export function getFyKey(d: Date): string {
  const y = d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear()
  return `FY${y}`
}

/** Get the 3 FY tabs: previous, current, next */
export function getFyTabs(): string[] {
  const now = new Date()
  const currentYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
  return [`FY${currentYear - 1}`, `FY${currentYear}`, `FY${currentYear + 1}`]
}

/** Get the previous FY key given a FY key, e.g. "FY2026" → "FY2025" */
export function getPreviousFy(fy: string): string {
  const year = parseInt(fy.replace('FY', ''), 10)
  return `FY${year - 1}`
}
```

- [ ] **Step 2: Verify build**

Run:
```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub && npx next build 2>&1 | tail -5
```
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub
git add src/lib/assumptions.ts
git commit -m "feat(assumptions): add type catalogue, FY helpers, and display formatters"
```

---

## Task 3: API Routes — GET + POST

**Files:**
- Create: `src/app/api/financials/assumptions/route.ts`

- [ ] **Step 1: Create the GET + POST route**

Create `src/app/api/financials/assumptions/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialAssumptions } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getAssumptionType, ASSUMPTION_TYPES } from '@/lib/assumptions'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const fy = searchParams.get('fy')

  const assumptions = await db.query.financialAssumptions.findMany({
    where: fy ? eq(financialAssumptions.fy, fy) : undefined,
    with: { entity: true },
    orderBy: (a, { asc }) => [asc(a.fy), asc(a.entityId), asc(a.assumptionType)],
  })

  return NextResponse.json(assumptions)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { fy, entityId, assumptionType, valueNumeric, valueText, rationale, approvedBy } = await request.json()

  if (!fy || !entityId || !assumptionType) {
    return NextResponse.json({ error: 'FY, entity, and type are required' }, { status: 400 })
  }

  if (!ASSUMPTION_TYPES.some((t) => t.key === assumptionType)) {
    return NextResponse.json({ error: 'Invalid assumption type' }, { status: 400 })
  }

  // Check for duplicate
  const existing = await db.query.financialAssumptions.findFirst({
    where: and(
      eq(financialAssumptions.fy, fy),
      eq(financialAssumptions.entityId, entityId),
      eq(financialAssumptions.assumptionType, assumptionType),
    ),
  })
  if (existing) {
    return NextResponse.json({ error: 'An assumption with this FY, entity, and type already exists' }, { status: 409 })
  }

  const [created] = await db.insert(financialAssumptions).values({
    fy,
    entityId,
    assumptionType,
    valueNumeric: valueNumeric ?? null,
    valueText: valueText ?? null,
    rationale: rationale ?? null,
    approvedBy: approvedBy ?? null,
    approvedDate: approvedBy ? new Date() : null,
  }).returning()

  return NextResponse.json(created, { status: 201 })
}
```

- [ ] **Step 2: Verify build**

Run:
```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub && npx next build 2>&1 | tail -5
```
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub
git add src/app/api/financials/assumptions/route.ts
git commit -m "feat(assumptions): add GET and POST API routes"
```

---

## Task 4: API Routes — PATCH + DELETE

**Files:**
- Create: `src/app/api/financials/assumptions/[id]/route.ts`

- [ ] **Step 1: Create the PATCH + DELETE route**

Create `src/app/api/financials/assumptions/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialAssumptions } from '@/lib/db/schema'
import { eq, and, ne } from 'drizzle-orm'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const allowedFields: Record<string, any> = {}
  if (body.fy !== undefined) allowedFields.fy = body.fy
  if (body.entityId !== undefined) allowedFields.entityId = body.entityId
  if (body.assumptionType !== undefined) allowedFields.assumptionType = body.assumptionType
  if (body.valueNumeric !== undefined) allowedFields.valueNumeric = body.valueNumeric
  if (body.valueText !== undefined) allowedFields.valueText = body.valueText
  if (body.rationale !== undefined) allowedFields.rationale = body.rationale
  if (body.approvedBy !== undefined) {
    allowedFields.approvedBy = body.approvedBy
    allowedFields.approvedDate = body.approvedBy ? new Date() : null
  }

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // If fy, entityId, or assumptionType changed, re-validate uniqueness
  if (allowedFields.fy || allowedFields.entityId || allowedFields.assumptionType) {
    // Get the current record to merge with updates
    const current = await db.query.financialAssumptions.findFirst({
      where: eq(financialAssumptions.id, id),
    })
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const checkFy = allowedFields.fy ?? current.fy
    const checkEntity = allowedFields.entityId ?? current.entityId
    const checkType = allowedFields.assumptionType ?? current.assumptionType

    const duplicate = await db.query.financialAssumptions.findFirst({
      where: and(
        eq(financialAssumptions.fy, checkFy),
        eq(financialAssumptions.entityId, checkEntity),
        eq(financialAssumptions.assumptionType, checkType),
        ne(financialAssumptions.id, id),
      ),
    })
    if (duplicate) {
      return NextResponse.json({ error: 'An assumption with this FY, entity, and type already exists' }, { status: 409 })
    }
  }

  allowedFields.updatedAt = new Date()

  const [updated] = await db.update(financialAssumptions)
    .set(allowedFields)
    .where(eq(financialAssumptions.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await db.delete(financialAssumptions).where(eq(financialAssumptions.id, id))
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Verify build**

Run:
```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub && npx next build 2>&1 | tail -5
```
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub
git add src/app/api/financials/assumptions/[id]/route.ts
git commit -m "feat(assumptions): add PATCH and DELETE API routes"
```

---

## Task 5: API Route — Copy from Previous FY

**Files:**
- Create: `src/app/api/financials/assumptions/copy/route.ts`

- [ ] **Step 1: Create the copy route**

Create `src/app/api/financials/assumptions/copy/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { financialAssumptions } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { fromFy, toFy } = await request.json()
  if (!fromFy || !toFy) {
    return NextResponse.json({ error: 'fromFy and toFy are required' }, { status: 400 })
  }

  // Get all assumptions from source FY
  const sourceAssumptions = await db.query.financialAssumptions.findMany({
    where: eq(financialAssumptions.fy, fromFy),
  })

  if (sourceAssumptions.length === 0) {
    return NextResponse.json({ copied: 0, skipped: 0 })
  }

  // Get existing assumptions in target FY to check for duplicates
  const targetAssumptions = await db.query.financialAssumptions.findMany({
    where: eq(financialAssumptions.fy, toFy),
  })

  const existingKeys = new Set(
    targetAssumptions.map((a) => `${a.entityId}:${a.assumptionType}`)
  )

  const toCopy = sourceAssumptions.filter(
    (a) => !existingKeys.has(`${a.entityId}:${a.assumptionType}`)
  )

  if (toCopy.length > 0) {
    await db.insert(financialAssumptions).values(
      toCopy.map((a) => ({
        fy: toFy,
        entityId: a.entityId,
        assumptionType: a.assumptionType,
        valueNumeric: a.valueNumeric,
        valueText: a.valueText,
        rationale: a.rationale,
        approvedBy: null,
        approvedDate: null,
      }))
    )
  }

  return NextResponse.json({
    copied: toCopy.length,
    skipped: sourceAssumptions.length - toCopy.length,
  })
}
```

- [ ] **Step 2: Verify build**

Run:
```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub && npx next build 2>&1 | tail -5
```
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub
git add src/app/api/financials/assumptions/copy/route.ts
git commit -m "feat(assumptions): add copy-from-previous-FY API route"
```

---

## Task 6: Page + View Component

**Files:**
- Create: `src/app/(dashboard)/financials/assumptions/page.tsx`
- Create: `src/components/financials/assumptions-view.tsx`

- [ ] **Step 1: Create the server component page**

Create `src/app/(dashboard)/financials/assumptions/page.tsx`:

```typescript
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { AssumptionsView } from '@/components/financials/assumptions-view'

export default async function AssumptionsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as any).role !== 'admin') {
    return <div className="text-center py-12 text-muted-foreground">Access denied.</div>
  }

  return (
    <div className="space-y-6">
      <AssumptionsView />
    </div>
  )
}
```

- [ ] **Step 2: Create the client view component**

Create `src/components/financials/assumptions-view.tsx`. This is the largest file — it contains: FY tabs, stat cards, entity sections with tables, create/edit dialog, delete confirmation, and copy button.

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTableContainer } from '@/components/ui/data-table-container'
import { SlidersHorizontal, Plus, Copy, MoreHorizontal, Pencil, Trash2, CheckCircle2, BarChart3, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  ASSUMPTION_TYPES,
  getAssumptionType,
  getAssumptionLabel,
  formatAssumptionValue,
  getFyTabs,
  getPreviousFy,
} from '@/lib/assumptions'

interface Entity {
  id: string
  name: string
  color: string
}

interface Assumption {
  id: string
  fy: string
  entityId: string | null
  assumptionType: string
  valueNumeric: string | null
  valueText: string | null
  rationale: string | null
  approvedBy: string | null
  approvedDate: string | null
  entity: Entity | null
}

const defaultForm = {
  fy: '',
  entityId: '',
  assumptionType: '',
  valueNumeric: '',
  valueText: '',
  rationale: '',
  approvedBy: '',
}

export function AssumptionsView() {
  const fyTabs = getFyTabs()
  const [selectedFy, setSelectedFy] = useState(fyTabs[1]) // current FY
  const [assumptions, setAssumptions] = useState<Assumption[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog state
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    try {
      const [assumptionsRes, entitiesRes] = await Promise.all([
        fetch('/api/financials/assumptions'),
        fetch('/api/financials/entities'),
      ])
      if (assumptionsRes.ok) setAssumptions(await assumptionsRes.json())
      if (entitiesRes.ok) {
        const allEntities = await entitiesRes.json()
        setEntities(allEntities.map((e: any) => ({ id: e.id, name: e.name, color: e.color })))
      }
    } catch {
      toast.error('Failed to load data')
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // Filter assumptions for selected FY
  const fyAssumptions = assumptions.filter((a) => a.fy === selectedFy)

  // Group by entity
  const byEntity = new Map<string, { entity: Entity; items: Assumption[] }>()
  for (const a of fyAssumptions) {
    if (!a.entityId || !a.entity) continue
    if (!byEntity.has(a.entityId)) {
      byEntity.set(a.entityId, { entity: a.entity, items: [] })
    }
    byEntity.get(a.entityId)!.items.push(a)
  }

  // Stats
  const totalCount = fyAssumptions.length
  const entitiesCovered = byEntity.size
  const approvedCount = fyAssumptions.filter((a) => a.approvedBy).length

  // Previous FY for copy button
  const previousFy = getPreviousFy(selectedFy)
  const previousFyHasAssumptions = assumptions.some((a) => a.fy === previousFy)

  function openCreate() {
    setEditingId(null)
    setForm({ ...defaultForm, fy: selectedFy })
    setShowDialog(true)
  }

  function openEdit(a: Assumption) {
    setEditingId(a.id)
    setForm({
      fy: a.fy,
      entityId: a.entityId ?? '',
      assumptionType: a.assumptionType,
      valueNumeric: a.valueNumeric ?? '',
      valueText: a.valueText ?? '',
      rationale: a.rationale ?? '',
      approvedBy: a.approvedBy ?? '',
    })
    setShowDialog(true)
  }

  async function handleSave() {
    if (!form.fy || !form.entityId || !form.assumptionType) {
      toast.error('FY, entity, and type are required')
      return
    }

    const typeDef = getAssumptionType(form.assumptionType)
    if (typeDef?.valueType === 'numeric') {
      const num = parseFloat(form.valueNumeric)
      if (isNaN(num) || num <= 0) {
        toast.error('Value must be greater than 0')
        return
      }
      if (typeDef.unit === '%' && num > 100) {
        toast.error('Percentage must be 100 or less')
        return
      }
    }
    if (typeDef?.valueType === 'enum' && !form.valueText) {
      toast.error('Please select a value')
      return
    }

    setSaving(true)
    try {
      const body = {
        fy: form.fy,
        entityId: form.entityId,
        assumptionType: form.assumptionType,
        valueNumeric: typeDef?.valueType === 'numeric' ? form.valueNumeric : null,
        valueText: typeDef?.valueType === 'enum' ? form.valueText : null,
        rationale: form.rationale || null,
        approvedBy: form.approvedBy || null,
      }

      const url = editingId
        ? `/api/financials/assumptions/${editingId}`
        : '/api/financials/assumptions'
      const method = editingId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to save')
        return
      }

      toast.success(editingId ? 'Assumption updated' : 'Assumption created')
      setShowDialog(false)
      loadData()
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/financials/assumptions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Assumption deleted')
        setDeletingId(null)
        loadData()
      } else {
        toast.error('Failed to delete')
      }
    } catch {
      toast.error('Failed to delete')
    }
  }

  async function handleCopy() {
    try {
      const res = await fetch('/api/financials/assumptions/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromFy: previousFy, toFy: selectedFy }),
      })
      if (res.ok) {
        const { copied, skipped } = await res.json()
        if (copied === 0) {
          toast(`Nothing to copy — ${previousFy} has no new assumptions`, { icon: 'ℹ️' })
        } else {
          toast.success(`Copied ${copied} assumption${copied > 1 ? 's' : ''} from ${previousFy}${skipped > 0 ? ` (${skipped} skipped)` : ''}`)
        }
        loadData()
      } else {
        toast.error('Failed to copy assumptions')
      }
    } catch {
      toast.error('Failed to copy assumptions')
    }
  }

  // Determine which value field to show in dialog
  const selectedTypeDef = getAssumptionType(form.assumptionType)

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Assumptions & Rules"
          subtitle="WFH %, phone %, vehicle % — set your FY assumptions"
        />
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Assumptions & Rules"
        subtitle="WFH %, phone %, vehicle % — set your FY assumptions"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!previousFyHasAssumptions}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy from {previousFy}
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Assumption
            </Button>
          </div>
        }
      />

      {/* FY Tabs */}
      <div className="flex gap-0 border-b-2 border-gray-200">
        {fyTabs.map((fy) => (
          <button
            key={fy}
            onClick={() => setSelectedFy(fy)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              selectedFy === fy
                ? 'text-gray-900 border-b-2 border-gray-900 -mb-[2px]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {fy}
          </button>
        ))}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Total Assumptions"
          value={totalCount}
          icon={SlidersHorizontal}
          iconColor="text-rose-600"
          iconBg="bg-rose-50"
        />
        <StatCard
          label="Entities Covered"
          value={`${entitiesCovered} / ${entities.length}`}
          icon={Users}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <StatCard
          label="Approved"
          value={`${approvedCount} / ${totalCount}`}
          icon={CheckCircle2}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
      </div>

      {/* Entity Sections or Empty State */}
      {byEntity.size === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title={`No assumptions for ${selectedFy}`}
          description={`Add assumptions for this financial year, or copy from ${previousFy} to get started.`}
          action={
            <div className="flex gap-2">
              {previousFyHasAssumptions && (
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy from {previousFy}
                </Button>
              )}
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Add Assumption
              </Button>
            </div>
          }
        />
      ) : (
        Array.from(byEntity.entries()).map(([entityId, { entity, items }]) => (
          <DataTableContainer
            key={entityId}
            title={entity.name}
            description={`${items.length} assumption${items.length > 1 ? 's' : ''}`}
            action={
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: entity.color }}
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Rationale</TableHead>
                  <TableHead>Approved</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {getAssumptionLabel(a.assumptionType)}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatAssumptionValue(a.assumptionType, a.valueNumeric, a.valueText)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                      {a.rationale ?? '—'}
                    </TableCell>
                    <TableCell>
                      {a.approvedBy ? (
                        <span className="text-green-600 text-sm flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {a.approvedBy}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(a)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeletingId(a.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableContainer>
        ))
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(v) => { if (!v) setShowDialog(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Assumption' : 'New Assumption'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update this financial assumption.' : 'Add a new financial assumption for the selected FY.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* FY */}
            <div>
              <label className="text-sm font-medium">Financial Year</label>
              <Select value={form.fy} onValueChange={(v) => setForm({ ...form, fy: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fyTabs.map((fy) => (
                    <SelectItem key={fy} value={fy}>{fy}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Entity */}
            <div>
              <label className="text-sm font-medium">Entity</label>
              <Select value={form.entityId} onValueChange={(v) => setForm({ ...form, entityId: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select entity" />
                </SelectTrigger>
                <SelectContent>
                  {entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assumption Type */}
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select
                value={form.assumptionType}
                onValueChange={(v) => setForm({ ...form, assumptionType: v, valueNumeric: '', valueText: '' })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {ASSUMPTION_TYPES.map((t) => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Value — conditional on type */}
            {selectedTypeDef && (
              <div>
                <label className="text-sm font-medium">Value</label>
                {selectedTypeDef.valueType === 'enum' ? (
                  <Select value={form.valueText} onValueChange={(v) => setForm({ ...form, valueText: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select value" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedTypeDef.options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type="number"
                    className="mt-1"
                    placeholder={selectedTypeDef.unit === '%' ? '0-100' : 'Enter value'}
                    value={form.valueNumeric}
                    onChange={(e) => setForm({ ...form, valueNumeric: e.target.value })}
                  />
                )}
              </div>
            )}

            {/* Rationale */}
            <div>
              <label className="text-sm font-medium">Rationale</label>
              <Textarea
                className="mt-1"
                placeholder="Why this value? (1-2 sentences)"
                value={form.rationale}
                onChange={(e) => setForm({ ...form, rationale: e.target.value })}
                rows={2}
              />
            </div>

            {/* Approved By */}
            <div>
              <label className="text-sm font-medium">Approved By</label>
              <Input
                className="mt-1"
                placeholder="Optional — who approved this?"
                value={form.approvedBy}
                onChange={(e) => setForm({ ...form, approvedBy: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingId} onOpenChange={(v) => { if (!v) setDeletingId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Assumption</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this assumption? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingId && handleDelete(deletingId)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run:
```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub && npx next build 2>&1 | tail -5
```
Expected: Build succeeds. The `/financials/assumptions` route appears in the output.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub
git add src/app/(dashboard)/financials/assumptions/page.tsx src/components/financials/assumptions-view.tsx
git commit -m "feat(assumptions): add assumptions page with FY tabs, entity sections, and CRUD dialog"
```

---

## Task 7: Home Page Update

**Files:**
- Modify: `src/app/(dashboard)/page.tsx` (lines ~216-224, the Assumptions NavCard)

- [ ] **Step 1: Enable the Assumptions NavCard**

In `src/app/(dashboard)/page.tsx`, find the NavCard with `title="Assumptions & Rules"` and remove the `badge="Coming soon"` and `disabled` props. The result should be:

```typescript
<NavCard
  title="Assumptions & Rules"
  description="WFH %, phone %, vehicle % — set your FY assumptions."
  href="/financials/assumptions"
  icon={SlidersHorizontal}
  iconColor="text-rose-600"
  iconBg="bg-rose-50"
/>
```

- [ ] **Step 2: Verify build**

Run:
```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub && npx next build 2>&1 | tail -5
```
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub
git add src/app/(dashboard)/page.tsx
git commit -m "feat(assumptions): enable Assumptions & Rules card on home page"
```

---

## Task 8: Manual Smoke Test

- [ ] **Step 1: Start dev server**

Run:
```bash
cd C:/Users/MagedBoctor/Claude/family-action-hub && npm run dev
```

- [ ] **Step 2: Verify the following flows**

1. Home page → Assumptions card is clickable (no "Coming soon" badge)
2. `/financials/assumptions` → Page loads with PageHeader, FY tabs, stat cards
3. FY tabs switch correctly, stats update per FY
4. Empty state shows when FY has no assumptions
5. "+ Add Assumption" → Dialog opens with FY pre-filled
6. Create an assumption → appears in the correct entity section
7. ⋯ menu → Edit → Dialog pre-filled → Save → Updates correctly
8. ⋯ menu → Delete → Confirmation → Deletes correctly
9. "Copy from [prev FY]" → Copies assumptions, toast confirms count
10. Duplicate check: try creating same FY + entity + type → Error toast

- [ ] **Step 3: Final commit if any fixes needed**

Only if smoke testing revealed issues that needed fixes.
