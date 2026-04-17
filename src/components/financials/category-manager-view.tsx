'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Save,
  X,
  Edit2,
  Loader2,
  Info,
} from 'lucide-react'

interface Subcategory {
  id: string
  categoryId: string
  name: string
  atoCode: string | null // legacy
  atoCodePersonal: string | null
  atoCodeCompany: string | null
  sortOrder: number
}

interface Category {
  id: string
  name: string
  color: string
  sortOrder: number
  subcategories: Subcategory[]
}

interface AtoCodeRef {
  code: string
  scope: 'personal' | 'company'
  section: string
  label: string
  description: string | null
  sortOrder: number
}

export function CategoryManagerView() {
  const [categories, setCategories] = useState<Category[]>([])
  const [personalCodes, setPersonalCodes] = useState<AtoCodeRef[]>([])
  const [companyCodes, setCompanyCodes] = useState<AtoCodeRef[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingSubToCategory, setAddingSubToCategory] = useState<string | null>(null)
  const [newSubName, setNewSubName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [catRes, atoRes] = await Promise.all([
        fetch('/api/financials/categories'),
        fetch('/api/financials/ato-codes'),
      ])
      if (catRes.ok) {
        const cats = (await catRes.json()) as Category[]
        setCategories(cats)
        // Auto-expand all by default
        setExpanded(new Set(cats.map(c => c.id)))
      }
      if (atoRes.ok) {
        const ato = await atoRes.json()
        setPersonalCodes(ato.personal || [])
        setCompanyCodes(ato.company || [])
      }
    } finally {
      setLoading(false)
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function updateSubcategory(sub: Subcategory, patch: Partial<Subcategory>) {
    try {
      const res = await fetch(`/api/financials/subcategories/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Subcategory updated')
      // Optimistic local update instead of full reload
      setCategories(prev =>
        prev.map(c =>
          c.id === sub.categoryId
            ? { ...c, subcategories: c.subcategories.map(s => (s.id === sub.id ? { ...s, ...patch } : s)) }
            : c
        )
      )
    } catch {
      toast.error('Update failed')
    }
  }

  async function deleteSubcategory(sub: Subcategory) {
    if (!confirm(`Delete subcategory "${sub.name}"?`)) return
    try {
      const res = await fetch(`/api/financials/subcategories/${sub.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      toast.success('Subcategory deleted')
      setCategories(prev =>
        prev.map(c =>
          c.id === sub.categoryId
            ? { ...c, subcategories: c.subcategories.filter(s => s.id !== sub.id) }
            : c
        )
      )
    } catch {
      toast.error('Delete failed')
    }
  }

  async function addSubcategory(categoryId: string) {
    if (!newSubName.trim()) return
    try {
      const res = await fetch('/api/financials/subcategories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, name: newSubName.trim() }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Subcategory added')
      setNewSubName('')
      setAddingSubToCategory(null)
      loadData()
    } catch {
      toast.error('Add failed')
    }
  }

  async function addCategory() {
    if (!newCategoryName.trim()) return
    try {
      const res = await fetch('/api/financials/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim(), subcategories: [] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || `Failed (${res.status})`)
        return
      }
      toast.success('Category added')
      setNewCategoryName('')
      loadData()
    } catch (e: any) {
      toast.error(e?.message ? `Add failed: ${e.message}` : 'Add failed (network error)')
    }
  }

  async function renameCategory(categoryId: string) {
    if (!editingCategoryName.trim()) return
    try {
      const res = await fetch(`/api/financials/categories/${categoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingCategoryName.trim() }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Category renamed')
      setEditingCategoryId(null)
      setEditingCategoryName('')
      loadData()
    } catch {
      toast.error('Rename failed')
    }
  }

  async function deleteCategory(category: Category) {
    if (!confirm(`Delete category "${category.name}" and all its subcategories? Transactions using it will become uncategorised.`)) return
    try {
      const res = await fetch(`/api/financials/categories/${category.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      toast.success('Category deleted')
      loadData()
    } catch {
      toast.error('Delete failed')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 space-y-1">
          <p>
            Each subcategory has <strong>two ATO code columns</strong>: one for personal entities
            (Individual Tax Return D-codes and I-codes) and one for Pty Ltd entities (Company Tax
            Return Item 6 codes). The tax export uses the right one based on the transaction's
            entity type.
          </p>
          <p>
            Reference workbook: <code className="bg-white px-1 py-0.5 rounded">docs/reference/phase-f-ato-codes.xlsx</code>
          </p>
        </div>
      </div>

      {/* Add category */}
      <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3">
        <input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="New category name (e.g. TELCO EXPENSES)"
          className="flex-1 h-9 px-3 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && addCategory()}
        />
        <button
          onClick={addCategory}
          disabled={!newCategoryName.trim()}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-md"
        >
          <Plus className="h-4 w-4" /> Add Category
        </button>
      </div>

      {/* Category list */}
      <div className="space-y-3">
        {categories.map((category) => {
          const isExpanded = expanded.has(category.id)
          const isEditing = editingCategoryId === category.id
          return (
            <div key={category.id} className="bg-white rounded-2xl border border-border overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-border">
                <button
                  onClick={() => toggleExpand(category.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {isEditing ? (
                  <>
                    <input
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      className="flex-1 h-8 px-2 text-sm border border-border rounded-md"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && renameCategory(category.id)}
                    />
                    <button
                      onClick={() => renameCategory(category.id)}
                      className="text-green-600 hover:text-green-700"
                      aria-label="Save"
                    >
                      <Save className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => { setEditingCategoryId(null); setEditingCategoryName('') }}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="flex-1 text-sm font-bold text-gray-900 uppercase tracking-wide">
                      {category.name}
                    </h3>
                    <span className="text-[11px] text-muted-foreground">
                      {category.subcategories.length} sub
                    </span>
                    <button
                      onClick={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name) }}
                      className="text-muted-foreground hover:text-blue-600"
                      aria-label="Edit"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteCategory(category)}
                      className="text-muted-foreground hover:text-red-600"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>

              {/* Subcategories */}
              {isExpanded && (
                <div className="divide-y divide-border">
                  <div className="grid grid-cols-[2fr_1.5fr_1.5fr_auto] gap-2 px-4 py-2 bg-gray-50/50 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    <span>Subcategory</span>
                    <span>Personal ATO code</span>
                    <span>Company ATO code</span>
                    <span></span>
                  </div>
                  {category.subcategories.map((sub) => (
                    <SubcategoryRow
                      key={sub.id}
                      sub={sub}
                      personalCodes={personalCodes}
                      companyCodes={companyCodes}
                      onUpdate={updateSubcategory}
                      onDelete={deleteSubcategory}
                    />
                  ))}
                  {/* Add subcategory */}
                  {addingSubToCategory === category.id ? (
                    <div className="px-4 py-2 flex items-center gap-2 bg-blue-50">
                      <input
                        value={newSubName}
                        onChange={(e) => setNewSubName(e.target.value)}
                        placeholder="New subcategory name"
                        className="flex-1 h-8 px-2 text-sm border border-border rounded-md"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addSubcategory(category.id)
                          if (e.key === 'Escape') { setAddingSubToCategory(null); setNewSubName('') }
                        }}
                      />
                      <button
                        onClick={() => addSubcategory(category.id)}
                        disabled={!newSubName.trim()}
                        className="text-xs font-medium text-blue-600 disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setAddingSubToCategory(null); setNewSubName('') }}
                        className="text-xs text-muted-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingSubToCategory(category.id)}
                      className="w-full px-4 py-2 text-xs text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Add subcategory
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SubcategoryRow({
  sub,
  personalCodes,
  companyCodes,
  onUpdate,
  onDelete,
}: {
  sub: Subcategory
  personalCodes: AtoCodeRef[]
  companyCodes: AtoCodeRef[]
  onUpdate: (sub: Subcategory, patch: Partial<Subcategory>) => void
  onDelete: (sub: Subcategory) => void
}) {
  return (
    <div className="grid grid-cols-[2fr_1.5fr_1.5fr_auto] gap-2 px-4 py-2 items-center hover:bg-gray-50/50">
      <span className="text-sm text-gray-900 truncate" title={sub.name}>
        {sub.name}
      </span>
      <AtoCodeSelect
        value={sub.atoCodePersonal}
        codes={personalCodes}
        placeholder="— (not deductible)"
        onChange={(v) => onUpdate(sub, { atoCodePersonal: v })}
      />
      <AtoCodeSelect
        value={sub.atoCodeCompany}
        codes={companyCodes}
        placeholder="— (not applicable)"
        onChange={(v) => onUpdate(sub, { atoCodeCompany: v })}
      />
      <button
        onClick={() => onDelete(sub)}
        className="text-muted-foreground hover:text-red-600"
        aria-label="Delete subcategory"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function AtoCodeSelect({
  value,
  codes,
  placeholder,
  onChange,
}: {
  value: string | null
  codes: AtoCodeRef[]
  placeholder: string
  onChange: (v: string | null) => void
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-8 w-full px-2 text-xs border border-border rounded-md bg-white"
    >
      <option value="">{placeholder}</option>
      {codes.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} — {c.label.replace(/^(Item \d+ — |D\d+ — |I-\d+ — )/, '')}
        </option>
      ))}
    </select>
  )
}
