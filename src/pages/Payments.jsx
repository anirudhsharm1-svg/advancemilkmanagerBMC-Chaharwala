import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, formatDate, formatPaymentMode } from '../utils/formatters'
import PaymentModal from '../components/PaymentModal'
import ConfirmDialog from '../components/ConfirmDialog'
import DataTable from '../components/DataTable'
import toast from 'react-hot-toast'
import { Plus, Trash2, Download } from 'lucide-react'

export default function Payments() {
  const [payments, setPayments] = useState([])
  const [farmers, setFarmers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [filterFarmer, setFilterFarmer] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const fetchAll = async () => {
    setLoading(true)
    const [payRes, farmRes] = await Promise.all([
      supabase.from('payments').select('*, farmers(name)').order('payment_date', { ascending: false }),
      supabase.from('farmers').select('*').neq('code', 'SYSTEM_RATES').order('name'),
    ])
    setPayments(payRes.data || [])
    setFarmers(farmRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const handleDelete = async () => {
    const pay = deleteTarget
    const { error } = await supabase.from('payments').delete().eq('id', pay.id)
    setDeleteTarget(null)
    if (error) { toast.error(error.message); return }
    const farmer = farmers.find(f => f.id === pay.farmer_id)
    if (farmer) {
      await supabase.from('farmers').update({ balance: parseFloat(farmer.balance) - pay.amount }).eq('id', pay.farmer_id)
    }
    toast.success('Payment deleted')
    fetchAll()
  }

  const filtered = payments.filter(p => {
    if (filterFarmer && p.farmer_id !== filterFarmer) return false
    if (filterFrom && p.payment_date < filterFrom) return false
    if (filterTo && p.payment_date > filterTo) return false
    return true
  })

  const totalPaid = filtered.reduce((s, p) => s + parseFloat(p.amount), 0)

  const exportCSV = () => {
    const rows = [['Date', 'Farmer', 'Amount', 'Mode', 'Note']]
    filtered.forEach(p => rows.push([p.payment_date, p.farmers?.name || '', p.amount, p.payment_mode, p.note || '']))
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'payments.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported to CSV!')
  }

  const columns = [
    { key: 'payment_date', label: 'Date', render: r => formatDate(r.payment_date) },
    { key: 'farmer', label: 'Farmer', render: r => <strong>{r.farmers?.name || '—'}</strong> },
    { key: 'amount', label: 'Amount', render: r => <strong style={{ color: '#16A34A' }}>{formatCurrency(r.amount)}</strong> },
    { key: 'payment_mode', label: 'Mode', render: r => <span className="badge badge-green">{formatPaymentMode(r.payment_mode)}</span> },
    { key: 'note', label: 'Note', render: r => <span style={{ color: '#6B7A90' }}>{r.note || '—'}</span> },
    {
      key: 'actions', label: '',
      render: r => (
        <button className="btn-ghost btn-sm" style={{ color: '#DC2626' }} onClick={e => { e.stopPropagation(); setDeleteTarget(r) }}>
          <Trash2 size={13} />
        </button>
      )
    },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">All farmer payment records</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" onClick={exportCSV}><Download size={16} /> Export CSV</button>
          <button className="btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Record Payment</button>
        </div>
      </div>

      <div className="filters-row">
        <select className="input" style={{ width: 200 }} value={filterFarmer} onChange={e => setFilterFarmer(e.target.value)}>
          <option value="">All Farmers</option>
          {farmers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <input type="date" className="input" style={{ width: 160 }} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} placeholder="From" />
        <input type="date" className="input" style={{ width: 160 }} value={filterTo} onChange={e => setFilterTo(e.target.value)} placeholder="To" />
        {(filterFarmer || filterFrom || filterTo) && (
          <button className="btn-ghost btn-sm" onClick={() => { setFilterFarmer(''); setFilterFrom(''); setFilterTo('') }}>Clear</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem', padding: '0.875rem 1.25rem', background: '#EFF6FF', borderRadius: 10, border: '1px solid #BFDBFE' }}>
        <div><span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1D4ED8' }}>TOTAL PAID</span><p style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1D4ED8' }}>{formatCurrency(totalPaid)}</p></div>
        <div style={{ width: 1, background: '#BFDBFE' }} />
        <div><span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1D4ED8' }}>ENTRIES</span><p style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1D4ED8' }}>{filtered.length}</p></div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <DataTable columns={columns} data={filtered} searchKeys={[]} emptyMessage="No payments recorded yet." pageSize={15} />
        </div>
      )}

      {showModal && <PaymentModal onClose={() => setShowModal(false)} onSaved={fetchAll} farmers={farmers} />}
      {deleteTarget && (
        <ConfirmDialog title="Delete Payment"
          message={`Delete payment of ${formatCurrency(deleteTarget.amount)}? Farmer balance will be updated.`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} confirmLabel="Delete" />
      )}
    </div>
  )
}
