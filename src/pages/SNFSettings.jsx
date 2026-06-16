import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { generateRatePreview } from '../utils/rateCalculator'
import { formatCurrency } from '../utils/formatters'
import DataTable from '../components/DataTable'
import ConfirmDialog from '../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, X, Settings, Download, Upload } from 'lucide-react'

const EMPTY_FORM = { snf_value: '', fat_min: '', fat_max: '', base_rate: '', rate_per_fat_increment: '' }

export default function SNFSettings() {
  const [slabs, setSlabs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)

  const fetchSlabs = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('snf_slabs').select('*').order('snf_value')
    if (error) toast.error('Failed to load slabs')
    else setSlabs(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchSlabs() }, [])

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setErrors({}); setShowModal(true) }
  const openEdit = (slab) => {
    setForm({
      snf_value: String(slab.snf_value),
      fat_min: String(slab.fat_min),
      fat_max: String(slab.fat_max),
      base_rate: String(slab.base_rate),
      rate_per_fat_increment: String(slab.rate_per_fat_increment),
    })
    setEditId(slab.id)
    setErrors({})
    setShowModal(true)
  }

  const validate = () => {
    const e = {}
    if (!form.snf_value || isNaN(form.snf_value)) e.snf_value = 'Valid SNF integer required'
    if (!form.fat_min || isNaN(form.fat_min)) e.fat_min = 'Valid FAT min required'
    if (!form.fat_max || isNaN(form.fat_max)) e.fat_max = 'Valid FAT max required'
    if (parseFloat(form.fat_min) >= parseFloat(form.fat_max)) e.fat_max = 'FAT max must be > FAT min'
    if (!form.base_rate || isNaN(form.base_rate)) e.base_rate = 'Valid base rate required'
    if (!form.rate_per_fat_increment || isNaN(form.rate_per_fat_increment)) e.rate_per_fat_increment = 'Valid increment required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    const payload = {
      snf_value: parseInt(form.snf_value),
      fat_min: parseFloat(form.fat_min),
      fat_max: parseFloat(form.fat_max),
      base_rate: parseFloat(form.base_rate),
      rate_per_fat_increment: parseFloat(form.rate_per_fat_increment),
    }
    let error
    if (editId) {
      ({ error } = await supabase.from('snf_slabs').update(payload).eq('id', editId))
    } else {
      ({ error } = await supabase.from('snf_slabs').insert(payload))
    }
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editId ? 'Slab updated!' : 'Slab added!')
    setShowModal(false)
    fetchSlabs()
  }

  const handleDelete = async () => {
    const { error } = await supabase.from('snf_slabs').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    if (error) { toast.error(error.message); return }
    toast.success('Slab deleted')
    fetchSlabs()
  }

  const handleExport = async () => {
    setExporting(true)
    const toastId = toast.loading('Preparing backup...')
    try {
      const tables = ['farmers', 'snf_slabs', 'milk_collections', 'payments', 'expenses']
      const backupData = {}
      for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*')
        if (error) throw error
        backupData[table] = data
      }
      const json = JSON.stringify(backupData, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `milk_manager_backup_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup exported successfully', { id: toastId })
    } catch (err) {
      toast.error('Export failed: ' + err.message, { id: toastId })
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    const toastId = toast.loading('Importing backup data...')
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      
      // Upsert order matters due to foreign keys: farmers -> collections & payments
      const tablesOrder = ['farmers', 'snf_slabs', 'milk_collections', 'payments', 'expenses']
      for (const table of tablesOrder) {
        if (data[table] && data[table].length > 0) {
           const { error } = await supabase.from(table).upsert(data[table])
           if (error) throw error
        }
      }
      toast.success('Data imported successfully!', { id: toastId })
      fetchSlabs() // refresh current view
    } catch (err) {
      toast.error('Import failed: ' + err.message, { id: toastId })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const previewSlab = form.fat_min && form.fat_max && form.base_rate && form.rate_per_fat_increment
    ? generateRatePreview({ fat_min: form.fat_min, fat_max: form.fat_max, base_rate: form.base_rate, rate_per_fat_increment: form.rate_per_fat_increment })
    : []

  const columns = [
    { key: 'snf_value', label: 'SNF Value', render: r => <strong>{r.snf_value}</strong> },
    { key: 'fat_range', label: 'FAT Range', render: r => `${r.fat_min} – ${r.fat_max}` },
    { key: 'base_rate', label: 'Base Rate (₹/ltr)', render: r => formatCurrency(r.base_rate) },
    { key: 'rate_per_fat_increment', label: 'Increment / 0.1 FAT', render: r => `₹${r.rate_per_fat_increment}` },
    {
      key: 'actions', label: 'Actions',
      render: r => (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openEdit(r) }}><Edit2 size={13} /></button>
          <button className="btn-ghost btn-sm" style={{ color: '#DC2626' }} onClick={e => { e.stopPropagation(); setDeleteTarget(r) }}><Trash2 size={13} /></button>
        </div>
      )
    },
  ]

  const f = (key) => ({ value: form[key], onChange: e => { setForm(p => ({ ...p, [key]: e.target.value })); setErrors(p => ({ ...p, [key]: '' })) } })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure SNF rates and manage application data</p>
        </div>
        <button className="btn-primary" onClick={openAdd}><Plus size={16} /> Add Slab</button>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <DataTable columns={columns} data={slabs} emptyMessage="No SNF slabs configured yet. Add your first slab." pageSize={20} />
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{editId ? 'Edit SNF Slab' : 'Add SNF Slab'}</h2>
              <button className="btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">SNF Value (integer)</label>
                  <input className={`input${errors.snf_value ? ' error' : ''}`} placeholder="e.g. 88" type="number" {...f('snf_value')} />
                  {errors.snf_value && <span className="form-error">{errors.snf_value}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">FAT Min</label>
                  <input className={`input${errors.fat_min ? ' error' : ''}`} placeholder="e.g. 5.1" type="number" step="0.1" {...f('fat_min')} />
                  {errors.fat_min && <span className="form-error">{errors.fat_min}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">FAT Max</label>
                  <input className={`input${errors.fat_max ? ' error' : ''}`} placeholder="e.g. 6.1" type="number" step="0.1" {...f('fat_max')} />
                  {errors.fat_max && <span className="form-error">{errors.fat_max}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Base Rate (₹/ltr at FAT min)</label>
                  <input className={`input${errors.base_rate ? ' error' : ''}`} placeholder="e.g. 30.00" type="number" step="0.01" {...f('base_rate')} />
                  {errors.base_rate && <span className="form-error">{errors.base_rate}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Rate Increment per 0.1 FAT</label>
                  <input className={`input${errors.rate_per_fat_increment ? ' error' : ''}`} placeholder="e.g. 0.32" type="number" step="0.01" {...f('rate_per_fat_increment')} />
                  {errors.rate_per_fat_increment && <span className="form-error">{errors.rate_per_fat_increment}</span>}
                </div>
              </div>

              {previewSlab.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6B7A90', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Live Rate Preview</p>
                  <div className="preview-table">
                    <table>
                      <thead><tr><th>FAT</th><th>Rate (₹/ltr)</th></tr></thead>
                      <tbody>
                        {previewSlab.map(row => (
                          <tr key={row.fat}>
                            <td>{row.fat.toFixed(1)}</td>
                            <td style={{ fontWeight: 600, color: '#0F6E56' }}>₹{row.rate.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : (editId ? 'Update Slab' : 'Add Slab')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete SNF Slab"
          message={`Delete SNF slab ${deleteTarget.snf_value}? This may affect future rate calculations.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          confirmLabel="Delete Slab"
        />
      )}

      <div style={{ marginTop: '3rem' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>Data Management</h2>
        <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 250px' }}>
            <h3 style={{ fontWeight: 600, fontSize: '1rem' }}>Backup Database</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Download a complete JSON backup of all farmers, collections, payments, and settings.</p>
          </div>
          <button className="btn-secondary" onClick={handleExport} disabled={exporting}>
             <Download size={16} /> {exporting ? 'Exporting...' : 'Export Backup'}
          </button>
          
          <div style={{ width: '1px', height: '40px', background: 'var(--border)', margin: '0 1rem' }} className="hide-on-mobile" />
          
          <div style={{ flex: '1 1 250px' }}>
            <h3 style={{ fontWeight: 600, fontSize: '1rem' }}>Restore Database</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Restore data from a previously downloaded JSON backup file.</p>
          </div>
          <input type="file" accept=".json" style={{ display: 'none' }} ref={fileInputRef} onChange={handleImport} />
          <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
             <Upload size={16} /> {importing ? 'Importing...' : 'Import Backup'}
          </button>
        </div>
      </div>
    </div>
  )
}
