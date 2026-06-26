import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, formatDate } from '../utils/formatters'
import DataTable from '../components/DataTable'
import ConfirmDialog from '../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, X, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const EMPTY_FORM = { code: '', name: '', phone: '', address: '', balance: '0', show_fat_snf_kg: false }

export default function Farmers() {
  const [farmers, setFarmers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const navigate = useNavigate()

  const fetchFarmers = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('farmers').select('*').neq('code', 'SYSTEM_RATES')
    if (error) toast.error('Failed to load farmers')
    else {
      const sorted = (data || []).sort((a, b) => {
        const numA = parseInt(a.code, 10)
        const numB = parseInt(b.code, 10)
        if (isNaN(numA) && isNaN(numB)) return (a.code || '').localeCompare(b.code || '')
        if (isNaN(numA)) return 1
        if (isNaN(numB)) return -1
        return numA - numB
      })
      setFarmers(sorted)
    }
    setLoading(false)
  }

  useEffect(() => { fetchFarmers() }, [])

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setErrors({}); setShowModal(true) }
  const openEdit = (farmer, e) => {
    e.stopPropagation()
    setForm({ 
      code: farmer.code || '',
      name: farmer.name, 
      phone: farmer.phone, 
      address: farmer.address || '', 
      balance: String(farmer.balance),
      show_fat_snf_kg: farmer.show_fat_snf_kg || false
    })
    setEditId(farmer.id)
    setErrors({})
    setShowModal(true)
  }

  const validate = () => {
    const e = {}
    if (!form.code.trim()) e.code = 'Farmer Code is required'
    else if (farmers.some(f => f.id !== editId && f.code?.trim().toLowerCase() === form.code.trim().toLowerCase())) {
      e.code = 'Farmer Code must be unique'
    }
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.phone.trim()) e.phone = 'Phone is required'
    else if (!/^[0-9]{10}$/.test(form.phone.trim())) e.phone = 'Enter valid 10-digit phone'
    if (isNaN(form.balance)) e.balance = 'Valid balance required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    const payload = { 
      code: form.code.trim(),
      name: form.name.trim(), 
      phone: form.phone.trim(), 
      address: form.address.trim() || null, 
      balance: parseFloat(form.balance),
      show_fat_snf_kg: !!form.show_fat_snf_kg
    }
    let error
    if (editId) {
      ({ error } = await supabase.from('farmers').update(payload).eq('id', editId))
    } else {
      ({ error } = await supabase.from('farmers').insert(payload))
    }
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editId ? 'Farmer updated!' : 'Farmer added!')
    setShowModal(false)
    fetchFarmers()
  }

  const handleDelete = async () => {
    const { error } = await supabase.from('farmers').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    if (error) { toast.error(error.message); return }
    toast.success('Farmer deleted')
    fetchFarmers()
  }

  const f = (key) => ({
    value: form[key],
    onChange: e => { setForm(p => ({ ...p, [key]: e.target.value })); setErrors(p => ({ ...p, [key]: '' })) }
  })

  const columns = [
    { key: 'code', label: 'Code', render: r => <strong style={{ color: '#475569' }}>{r.code || '—'}</strong> },
    { key: 'name', label: 'Name', render: r => <strong style={{ color: '#0F6E56' }}>{r.name}</strong> },
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address', render: r => r.address || '—' },
    {
      key: 'balance', label: 'Balance',
      render: r => {
        const bal = parseFloat(r.balance)
        return (
          <span className={bal < 0 ? 'balance-negative' : bal > 0 ? 'balance-positive' : ''}>
            {bal < 0 ? `${formatCurrency(Math.abs(bal))} Due` : bal > 0 ? `${formatCurrency(bal)} Advance` : '₹0.00'}
          </span>
        )
      }
    },
    {
      key: 'actions', label: 'Actions',
      render: r => (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-ghost btn-sm" onClick={e => openEdit(r, e)}><Edit2 size={13} /></button>
          <button className="btn-ghost btn-sm" style={{ color: '#DC2626' }}
            onClick={e => { e.stopPropagation(); setDeleteTarget(r) }}><Trash2 size={13} /></button>
        </div>
      )
    },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Farmers</h1>
          <p className="page-subtitle">{farmers.length} registered farmers</p>
        </div>
        <button className="btn-primary" onClick={openAdd}><UserPlus size={16} /> Add Farmer</button>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <DataTable
            columns={columns}
            data={farmers}
            searchKeys={['code', 'name', 'phone']}
            emptyMessage="No farmers registered yet."
            onRowClick={r => navigate(`/farmers/${r.id}`)}
            pageSize={15}
          />
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{editId ? 'Edit Farmer' : 'Add Farmer'}</h2>
              <button className="btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Farmer Code (Unique) *</label>
                <input className={`input${errors.code ? ' error' : ''}`} placeholder="e.g. 1001" {...f('code')} />
                {errors.code && <span className="form-error">{errors.code}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input className={`input${errors.name ? ' error' : ''}`} placeholder="Ramesh Patel" {...f('name')} />
                {errors.name && <span className="form-error">{errors.name}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number *</label>
                <input className={`input${errors.phone ? ' error' : ''}`} placeholder="9876543210" maxLength={10} {...f('phone')} />
                {errors.phone && <span className="form-error">{errors.phone}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Address (optional)</label>
                <input className="input" placeholder="Village, District" {...f('address')} />
              </div>
              <div className="form-group">
                <label className="form-label">Opening Balance (₹)</label>
                <input type="number" step="0.01" className={`input${errors.balance ? ' error' : ''}`}
                  placeholder="0.00 (positive = advance, negative = due)" {...f('balance')} />
                {errors.balance && <span className="form-error">{errors.balance}</span>}
                <span style={{ fontSize: '0.78rem', color: '#6B7A90', marginTop: '0.2rem' }}>
                  Positive = advance given to farmer · Negative = farmer owes dues
                </span>
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input 
                  type="checkbox" 
                  id="show_fat_snf_kg"
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#0F6E56' }}
                  checked={form.show_fat_snf_kg || false}
                  onChange={e => setForm(p => ({ ...p, show_fat_snf_kg: e.target.checked }))}
                />
                <label htmlFor="show_fat_snf_kg" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                  Show Fat/SNF Kg in Reports
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : (editId ? 'Update Farmer' : 'Add Farmer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Farmer"
          message={`Delete ${deleteTarget.name}? All their collections and payments will also be deleted.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          confirmLabel="Delete Farmer"
        />
      )}
    </div>
  )
}
