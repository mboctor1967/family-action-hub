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
import { SlidersHorizontal, Plus, Copy, MoreHorizontal, Pencil, Trash2, CheckCircle2, Users } from 'lucide-react'
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
                        <DropdownMenuTrigger
                          className="inline-flex items-center justify-center h-8 w-8 p-0 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                        >
                          <MoreHorizontal className="h-4 w-4" />
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
              <Select value={form.fy} onValueChange={(v) => setForm({ ...form, fy: v ?? '' })}>
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
              <Select value={form.entityId} onValueChange={(v) => setForm({ ...form, entityId: v ?? '' })}>
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
                onValueChange={(v) => setForm({ ...form, assumptionType: v ?? '', valueNumeric: '', valueText: '' })}
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
                  <Select value={form.valueText} onValueChange={(v) => setForm({ ...form, valueText: v ?? '' })}>
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
