import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, formatDate, formatCategory, todayStr } from '../utils/formatters'
import ConfirmDialog from '../components/ConfirmDialog'
import DataTable from '../components/DataTable'
import toast from 'react-hot-toast'
import { Plus, Trash2, X } from 'lucide-react'

const CATS = ['fuel', 'maintenance', 'salary', 'other']
const EMPTY = { description: '', amount: '', category: 'other', expense_date: todayStr() }

export default function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [filterCat, setFilterCat] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const fetchExpenses = async () => {
    setLoading(true)
    const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchExpenses() }, [])

  const set = (key, val) => { setForm(p => ({ ...p, [key]: val })); setErrors(p => ({ ...p, [key]: '' })) }

  const validate = () => {
    const e = {}
    if (!form.description.trim()) e.description = 'Description required'
    if (!form.amount || isNaN(form.amount) || parseFloat(form.amount) <= 0) e.amount = 'Valid amount required'
    if (!form.expense_date) e.expense_date = 'Date required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    const { error } = await supabase.from('expenses').insert({
      description: form.description.trim(),
      amount: parseFloat(form.amount),
      category: form.category,
      expense_date: form.expense_date,
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Expense added!')
    setShowModal(false)
    setForm(EMPTY)
    fetchExpenses()
  }

  const handleDelete = async () => {
    const { error } = await supabase.from('expenses').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    if (error) { toast.error(error.message); return }
    toast.success('Expense deleted')
    fetchExpenses()
  }

  const filtered = expenses.filter(e => {
    if (filterCat && e.category !== filterCat) return false
    if (filterFrom && e.expense_date < filterFrom) return false
    if (filterTo && e.expense_date > filterTo) return false
    return true
  })

  const totalExp = filtered.reduce((s, e) => s + parseFloat(e.amount), 0)
  const catColors = { fuel: 'badge-orange', maintenance: 'badge-blue', salary: 'badge-green', other: 'badge-red' }

  const columns = [
    { key: 'expense_date', label: 'Date', render: r => formatDate(r.expense_date) },
    { key: 'description', label: 'Description', render: r => <strong>{r.description}</strong> },
    { key: 'category', label: 'Category', render: r => <span className={`badge ${catColors[r.category] || 'badge-blue'}`}>{formatCategory(r.category)}</span> },
    { key: 'amount', label: 'Amount', render: r => <strong style={{ color: '#DC2626' }}>{formatCurrency(r.amount)}</strong> },
    { key: 'actions', label: '', render: r => (
      <button className="btn-ghost btn-sm" style={{ color: '#DC2626' }} onClick={e => { e.stopPropagation(); setDeleteTarget(r) }}><Trash2 size={13} /></button>
    )},
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">Track operational expenses</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(EMPTY); setErrors({}); setShowModal(true) }}>
          <Plus size={16} /> Add Expense
        </button>
      </div>

      <div className="filters-row">
        <select className="input" style={{ width: 180 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {CATS.map(c => <option key={c} value={c}>{formatCategory(c)}</option>)}
        </select>
        <input type="date" className="input" style={{ width: 160 }} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
        <input type="date" className="input" style={{ width: 160 }} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
        {(filterCat || filterFrom || filterTo) && (
          <button className="btn-ghost btn-sm" onClick={() => { setFilterCat(''); setFilterFrom(''); setFilterTo('') }}>Clear</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem', padding: '0.875rem 1.25rem', background: '#FEF2F2', borderRadius: 10, border: '1px solid #FECACA' }}>
        <div>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#991B1B' }}>TOTAL EXPENSES</span>
          <p style={{ fontWeight: 800, fontSize: '1.1rem', color: '#DC2626' }}>{formatCurrency(totalExp)}</p>
        </div>
        <div style={{ width: 1, background: '#FECACA' }} />
        <div>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#991B1B' }}>ENTRIES</span>
          <p style={{ fontWeight: 800, fontSize: '1.1rem', color: '#DC2626' }}>{filtered.length}</p>
        </div>
      </div>

      {loading ? <div className="loading-center"><div className="spinner" /></div> : (
        <div className="card" style={{ padding: 0 }}>
          <DataTable columns={columns} data={filtered} searchKeys={[]} emptyMessage="No expenses recorded yet." pageSize={15} />
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>Add Expense</h2>
              <button className="btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Description *</label>
                <input className={`input${errors.description ? ' error' : ''}`} placeholder="e.g. Diesel for vehicle"
                  value={form.description} onChange={e => set('description', e.target.value)} />
                {errors.description && <span className="form-error">{errors.description}</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
                <div className="form-group">
                  <label className="form-label">Amount (₹) *</label>
                  <input type="number" step="0.01" className={`input${errors.amount ? ' error' : ''}`}
                    placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
                  {errors.amount && <span className="form-error">{errors.amount}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input type="date" className={`input${errors.expense_date ? ' error' : ''}`}
                    value={form.expense_date} onChange={e => set('expense_date', e.target.value)} />
                  {errors.expense_date && <span className="form-error">{errors.expense_date}</span>}
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Category</label>
                  <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
                    {CATS.map(c => <option key={c} value={c}>{formatCategory(c)}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Add Expense'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog title="Delete Expense"
          message={`Delete "${deleteTarget.description}" (${formatCurrency(deleteTarget.amount)})?`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} confirmLabel="Delete" />
      )}
    </div>
  )
}
