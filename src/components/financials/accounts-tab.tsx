'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { Building2, Plus, Save, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

interface Entity {
  id: string
  name: string
  type: string
  color: string
  accounts: Account[]
}

interface Account {
  id: string
  bankName: string
  accountName: string | null
  accountNumber: string | null
  accountNumberLast4: string | null
  bsb: string | null
  accountType: string | null
  entityId: string | null
  entity?: { id: string; name: string; color: string } | null
  currency: string
}

const entityTypeColors: Record<string, string> = {
  personal: 'bg-blue-100 text-blue-700',
  business: 'bg-red-100 text-red-700',
  trust: 'bg-green-100 text-green-700',
}

const accountTypeLabel = (t: string | null) => {
  if (!t) return '—'
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function AccountsTab() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  // Entity dialogs
  const [showNewEntity, setShowNewEntity] = useState(false)
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null)
  const [entityForm, setEntityForm] = useState({ name: '', type: 'personal', color: '#2B579A' })

  // Account dialogs
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [accountForm, setAccountForm] = useState({
    bankName: '', accountName: '', bsb: '', accountNumber: '', accountType: 'personal_cheque', entityId: '',
  })

  const [resetting, setResetting] = useState(false)
  const [statements, setStatements] = useState<any[]>([])

  async function loadData() {
    setLoading(true)
    try {
      const [entRes, acctRes, stmtRes] = await Promise.all([
        fetch('/api/financials/entities'),
        fetch('/api/financials/accounts'),
        fetch('/api/financials/statements'),
      ])
      if (entRes.ok) setEntities(await entRes.json())
      if (acctRes.ok) setAccounts(await acctRes.json())
      if (stmtRes.ok) setStatements(await stmtRes.json())
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // --- Entity CRUD ---
  function openNewEntity() {
    setEntityForm({ name: '', type: 'personal', color: '#2B579A' })
    setShowNewEntity(true)
  }

  function openEditEntity(e: Entity) {
    setEntityForm({ name: e.name, type: e.type, color: e.color })
    setEditingEntity(e)
  }

  async function saveEntity() {
    if (!entityForm.name.trim()) return
    try {
      if (editingEntity) {
        const res = await fetch(`/api/financials/entities/${editingEntity.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entityForm),
        })
        if (res.ok) { toast.success('Entity updated'); setEditingEntity(null); loadData() }
        else toast.error((await res.json()).error || 'Failed')
      } else {
        const res = await fetch('/api/financials/entities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entityForm),
        })
        if (res.ok) { toast.success('Entity created'); setShowNewEntity(false); loadData() }
        else toast.error((await res.json()).error || 'Failed')
      }
    } catch { toast.error('Failed') }
  }

  async function deleteEntity(id: string, name: string) {
    if (!confirm(`Delete entity "${name}"? Accounts will be unlinked (not deleted).`)) return
    try {
      const res = await fetch(`/api/financials/entities/${id}`, { method: 'DELETE' })
      if (res.ok) { toast.success('Entity deleted'); loadData() }
      else toast.error('Failed')
    } catch { toast.error('Failed') }
  }

  // --- Account CRUD ---
  function openNewAccount() {
    setAccountForm({ bankName: '', accountName: '', bsb: '', accountNumber: '', accountType: 'personal_cheque', entityId: '' })
    setShowNewAccount(true)
  }

  function openEditAccount(a: Account) {
    setAccountForm({
      bankName: a.bankName,
      accountName: a.accountName || '',
      bsb: a.bsb || '',
      accountNumber: a.accountNumber || '',
      accountType: a.accountType || 'personal_cheque',
      entityId: a.entityId || '',
    })
    setEditingAccount(a)
  }

  async function saveAccount() {
    if (!accountForm.bankName.trim()) { toast.error('Bank name is required'); return }
    try {
      const payload = {
        ...accountForm,
        entityId: accountForm.entityId || null,
      }
      if (editingAccount) {
        const res = await fetch(`/api/financials/accounts/${editingAccount.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) { toast.success('Account updated'); setEditingAccount(null); loadData() }
        else toast.error((await res.json()).error || 'Failed')
      } else {
        const res = await fetch('/api/financials/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) { toast.success('Account created'); setShowNewAccount(false); loadData() }
        else toast.error((await res.json()).error || 'Failed')
      }
    } catch { toast.error('Failed') }
  }

  async function deleteAccount(id: string, name: string) {
    if (!confirm(`Delete account "${name}"? All statements and transactions for this account will be deleted.`)) return
    try {
      const res = await fetch(`/api/financials/accounts/${id}`, { method: 'DELETE' })
      if (res.ok) { toast.success('Account deleted'); loadData() }
      else toast.error('Failed')
    } catch { toast.error('Failed') }
  }

  async function reassignStatement(statementId: string, accountId: string | null) {
    try {
      const res = await fetch(`/api/financials/statements/${statementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      if (res.ok) { toast.success('Statement reassigned'); loadData() }
      else toast.error('Failed')
    } catch { toast.error('Failed') }
  }

  async function deleteStatement(statementId: string, fileName: string) {
    if (!confirm(`Delete statement "${fileName}" and all its transactions?`)) return
    try {
      const res = await fetch(`/api/financials/statements/${statementId}`, { method: 'DELETE' })
      if (res.ok) { toast.success('Statement deleted'); loadData() }
      else toast.error('Failed')
    } catch { toast.error('Failed') }
  }

  async function quickAssignEntity(accountId: string, entityId: string | null) {
    try {
      const res = await fetch(`/api/financials/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId }),
      })
      if (res.ok) { toast.success('Updated'); loadData() }
    } catch { toast.error('Failed') }
  }

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>

  const unassigned = accounts.filter((a) => !a.entityId)

  // --- Entity form dialog (shared for new/edit) ---
  const entityDialog = (
    <Dialog
      open={showNewEntity || !!editingEntity}
      onOpenChange={(v) => { if (!v) { setShowNewEntity(false); setEditingEntity(null) } }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingEntity ? 'Edit Entity' : 'New Entity'}</DialogTitle>
          <DialogDescription>
            {editingEntity ? 'Update entity details.' : 'Create a new ownership entity for grouping accounts.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Entity Name</label>
            <Input
              value={entityForm.name}
              onChange={(e) => setEntityForm({ ...entityForm, name: e.target.value })}
              placeholder="e.g. Data Driven Design Pty Ltd"
              className="mt-1"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={entityForm.type} onValueChange={(v) => v && setEntityForm({ ...entityForm, type: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue>
                    {entityForm.type === 'personal' ? 'Personal' : entityForm.type === 'business' ? 'Business' : 'Trust'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="trust">Trust</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Color</label>
              <Input
                type="color"
                value={entityForm.color}
                onChange={(e) => setEntityForm({ ...entityForm, color: e.target.value })}
                className="mt-1 h-9 p-1"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setShowNewEntity(false); setEditingEntity(null) }}>Cancel</Button>
          <Button onClick={saveEntity} disabled={!entityForm.name.trim()}>
            {editingEntity ? 'Save Changes' : 'Create Entity'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  // --- Account form dialog (shared for new/edit) ---
  const accountDialog = (
    <Dialog
      open={showNewAccount || !!editingAccount}
      onOpenChange={(v) => { if (!v) { setShowNewAccount(false); setEditingAccount(null) } }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingAccount ? 'Edit Account' : 'New Account'}</DialogTitle>
          <DialogDescription>
            {editingAccount ? `Update details for ${editingAccount.bankName}` : 'Manually add a bank account.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Bank Name *</label>
            <Input
              value={accountForm.bankName}
              onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })}
              placeholder="e.g. CommBank, ANZ, Westpac"
              className="mt-1 h-9 text-sm"
              autoFocus={!editingAccount}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Account Name (as on statement)</label>
            <Input
              value={accountForm.accountName}
              onChange={(e) => setAccountForm({ ...accountForm, accountName: e.target.value })}
              placeholder="e.g. Maged W. H. BOCTOR MIKHAIL"
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">BSB</label>
              <Input
                value={accountForm.bsb}
                onChange={(e) => setAccountForm({ ...accountForm, bsb: e.target.value })}
                placeholder="062-190"
                className="mt-1 h-9 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Account Number (full)</label>
              <Input
                value={accountForm.accountNumber}
                onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })}
                placeholder="10001521"
                className="mt-1 h-9 text-sm font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Account Type</label>
              <Select value={accountForm.accountType} onValueChange={(v) => v && setAccountForm({ ...accountForm, accountType: v })}>
                <SelectTrigger className="h-9 mt-1 text-sm">
                  <SelectValue>
                    {accountForm.accountType === 'personal_cheque' ? 'Personal Transaction' :
                     accountForm.accountType === 'personal_savings' ? 'Personal Savings' :
                     accountForm.accountType === 'business_cheque' ? 'Business Transaction' :
                     accountForm.accountType === 'credit_card' ? 'Credit Card' : accountForm.accountType}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal_cheque">Personal Transaction</SelectItem>
                  <SelectItem value="personal_savings">Personal Savings</SelectItem>
                  <SelectItem value="business_cheque">Business Transaction</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Entity</label>
              <Select
                value={accountForm.entityId || 'none'}
                onValueChange={(v) => v && setAccountForm({ ...accountForm, entityId: v === 'none' ? '' : v })}
              >
                <SelectTrigger className="h-9 mt-1 text-sm">
                  <SelectValue>
                    {accountForm.entityId
                      ? entities.find((e) => e.id === accountForm.entityId)?.name || 'Unknown'
                      : 'Unassigned'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setShowNewAccount(false); setEditingAccount(null) }}>Cancel</Button>
          <Button onClick={saveAccount} disabled={!accountForm.bankName.trim()}>
            <Save className="h-4 w-4 mr-1" />
            {editingAccount ? 'Save Changes' : 'Create Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return (
    <div className="space-y-6">
      {/* Entities */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Entities</h3>
        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={openNewEntity}>
          <Plus className="h-3.5 w-3.5" />
          New Entity
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {entities.map((entity) => (
          <div key={entity.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 group relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entity.color }} />
              <span className="text-sm font-medium">{entity.name}</span>
            </div>
            <Badge className={`text-[10px] ${entityTypeColors[entity.type] || ''}`}>{entity.type}</Badge>
            <p className="text-xs text-muted-foreground mt-2">
              {entity.accounts.length} account{entity.accounts.length !== 1 ? 's' : ''}
            </p>
            <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
              <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => openEditEntity(entity)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-red-500 hover:bg-red-50" onClick={() => deleteEntity(entity.id, entity.name)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
        {entities.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-4">No entities yet. Create one to group your accounts.</p>
        )}
      </div>

      {/* Accounts */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Bank Accounts</h3>
        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={openNewAccount}>
          <Plus className="h-3.5 w-3.5" />
          New Account
        </Button>
      </div>

      {unassigned.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <Building2 className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800">
            {unassigned.length} account{unassigned.length > 1 ? 's' : ''} not assigned to an entity.
          </span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Bank</TableHead>
              <TableHead className="text-xs">Account Name</TableHead>
              <TableHead className="text-xs">BSB</TableHead>
              <TableHead className="text-xs">Account #</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Entity</TableHead>
              <TableHead className="text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="text-xs font-medium">{account.bankName}</TableCell>
                <TableCell className="text-xs">{account.accountName || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-xs font-mono">{account.bsb || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-xs font-mono">
                  {account.accountNumber || (account.accountNumberLast4 ? `••${account.accountNumberLast4}` : <span className="text-muted-foreground">—</span>)}
                </TableCell>
                <TableCell className="text-xs">{accountTypeLabel(account.accountType)}</TableCell>
                <TableCell>
                  <Select
                    value={account.entityId || 'none'}
                    onValueChange={(v) => v && quickAssignEntity(account.id, v === 'none' ? null : v)}
                  >
                    <SelectTrigger className="h-7 w-44 text-xs">
                      <SelectValue>
                        {account.entityId
                          ? entities.find((e) => e.id === account.entityId)?.name || 'Unknown'
                          : 'Unassigned'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {entities.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={() => openEditAccount(account)}>
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => deleteAccount(account.id, `${account.bankName} ${account.accountNumber || ''}`)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                  No accounts yet. Import statements or create one manually.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Statements */}
      {statements.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-700">Imported Statements</h3>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-xs">File</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs text-center">Txns</TableHead>
                  <TableHead className="text-xs">Mapped Account</TableHead>
                  <TableHead className="text-xs w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.map((stmt: any) => (
                  <TableRow key={stmt.id}>
                    <TableCell className="text-xs">
                      <div>
                        <span className="font-medium">{stmt.fileName || '—'}</span>
                        {stmt.bankName && (
                          <Badge variant="secondary" className="ml-1.5 text-[10px]">{stmt.bankName}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${
                        stmt.sourceType === 'csv' ? 'bg-blue-100 text-blue-700' :
                        stmt.sourceType === 'qfx' ? 'bg-green-100 text-green-700' :
                        stmt.sourceType === 'pdf_ocr' ? 'bg-amber-100 text-amber-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {(stmt.sourceType || 'pdf').toUpperCase().replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {stmt.statementStart && stmt.statementEnd
                        ? `${stmt.statementStart} → ${stmt.statementEnd}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-center">{stmt.transactionCount || 0}</TableCell>
                    <TableCell>
                      <Select
                        value={stmt.accountId || 'none'}
                        onValueChange={(v) => v && reassignStatement(stmt.id, v === 'none' ? null : v)}
                      >
                        <SelectTrigger className="h-7 w-52 text-xs">
                          <SelectValue>
                            {stmt.accountId
                              ? (() => {
                                  const acct = accounts.find((a) => a.id === stmt.accountId)
                                  return acct ? `${acct.bankName} ${acct.accountNumber || acct.accountName || ''}`.trim() : 'Unknown'
                                })()
                              : 'Unassigned'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.bankName} {a.accountNumber || ''} {a.accountName ? `(${a.accountName})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                        onClick={() => deleteStatement(stmt.id, stmt.fileName || 'unknown')}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Data Management */}
      <div className="border-t pt-6 mt-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Data Management</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
            onClick={async () => {
              if (!confirm('Delete all transactions? Statements and accounts will be kept.')) return
              setResetting(true)
              try {
                const res = await fetch('/api/financials/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'transactions' }) })
                if (res.ok) { const d = await res.json(); toast.success(`Deleted ${d.deleted.transactions} transactions`); loadData() }
              } catch { toast.error('Failed') }
              setResetting(false)
            }}
            disabled={resetting}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear Transactions
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs text-orange-700 border-orange-200 hover:bg-orange-50"
            onClick={async () => {
              if (!confirm('Delete all statements and their transactions? Accounts will be kept.')) return
              setResetting(true)
              try {
                const res = await fetch('/api/financials/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'statements' }) })
                if (res.ok) { const d = await res.json(); toast.success(`Deleted ${d.deleted.statements} statements`); loadData() }
              } catch { toast.error('Failed') }
              setResetting(false)
            }}
            disabled={resetting}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear Statements + Transactions
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs text-red-700 border-red-200 hover:bg-red-50"
            onClick={async () => {
              if (!confirm('⚠️ DELETE EVERYTHING? All accounts, statements, transactions, and error logs. Entity mappings will be lost.')) return
              setResetting(true)
              try {
                const res = await fetch('/api/financials/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'all' }) })
                if (res.ok) { const d = await res.json(); toast.success(`Deleted: ${d.deleted.transactions || 0} txns, ${d.deleted.statements || 0} stmts, ${d.deleted.accounts || 0} accts`); loadData() }
              } catch { toast.error('Failed') }
              setResetting(false)
            }}
            disabled={resetting}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> Reset All Financial Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs text-gray-500 border-gray-200 hover:bg-gray-50"
            onClick={async () => {
              setResetting(true)
              try {
                const res = await fetch('/api/financials/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'errors' }) })
                if (res.ok) { const d = await res.json(); toast.success(`Cleared ${d.deleted.errors} error logs`) }
              } catch { toast.error('Failed') }
              setResetting(false)
            }}
            disabled={resetting}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear Error Logs
          </Button>
        </div>
      </div>

      {entityDialog}
      {accountDialog}
    </div>
  )
}
