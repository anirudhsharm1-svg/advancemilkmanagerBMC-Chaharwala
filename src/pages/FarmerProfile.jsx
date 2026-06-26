import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, formatDate, formatFAT, formatLiters, formatPaymentMode } from '../utils/formatters'
import CollectionModal from '../components/CollectionModal'
import PaymentModal from '../components/PaymentModal'
import ConfirmDialog from '../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { ArrowLeft, Plus, CreditCard, Droplets, Trash2 } from 'lucide-react'

export default function FarmerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [farmer, setFarmer] = useState(null)
  const [farmers, setFarmers] = useState([])
  const [collections, setCollections] = useState([])
  const [payments, setPayments] = useState([])
  const [slabs, setSlabs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCollection, setShowCollection] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [deleteCol, setDeleteCol] = useState(null)
  const [deletePay, setDeletePay] = useState(null)

  const fetchAll = async () => {
    setLoading(true)
    const [farmerRes, colRes, payRes, slabsRes, farmersRes] = await Promise.all([
      supabase.from('farmers').select('*').eq('id', id).single(),
      supabase.from('milk_collections').select('*').eq('farmer_id', id).order('collection_date', { ascending: false }),
      supabase.from('payments').select('*').eq('farmer_id', id).order('payment_date', { ascending: false }),
      supabase.from('snf_slabs').select('*'),
      supabase.from('farmers').select('*').neq('code', 'SYSTEM_RATES').order('name'),
    ])
    if (farmerRes.error) { toast.error('Farmer not found'); navigate('/farmers'); return }
    setFarmer(farmerRes.data)
    setCollections(colRes.data || [])
    setPayments(payRes.data || [])
    setSlabs(slabsRes.data || [])
    setFarmers(farmersRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [id])

  const handleDeleteCol = async () => {
    const col = deleteCol
    const { error } = await supabase.from('milk_collections').delete().eq('id', col.id)
    setDeleteCol(null)
    if (error) { toast.error(error.message); return }
    const newBalance = parseFloat(farmer.balance) + col.total_amount
    await supabase.from('farmers').update({ balance: newBalance }).eq('id', id)
    toast.success('Collection deleted')
    fetchAll()
  }

  const handleDeletePay = async () => {
    const pay = deletePay
    const { error } = await supabase.from('payments').delete().eq('id', pay.id)
    setDeletePay(null)
    if (error) { toast.error(error.message); return }
    const newBalance = parseFloat(farmer.balance) - pay.amount
    await supabase.from('farmers').update({ balance: newBalance }).eq('id', id)
    toast.success('Payment deleted')
    fetchAll()
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!farmer) return null

  const totalLiters = collections.reduce((s, c) => s + parseFloat(c.quantity_liters), 0)
  const totalEarned = collections.reduce((s, c) => s + parseFloat(c.total_amount), 0)
  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount), 0)
  const balance = parseFloat(farmer.balance)

  return (
    <div>
      <button className="btn-ghost" onClick={() => navigate('/farmers')} style={{ marginBottom: '1rem' }}>
        <ArrowLeft size={16} /> Back to Farmers
      </button>

      {/* Farmer info card */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'linear-gradient(135deg, #0F6E56, #1a9e7a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 800, fontSize: '1.3rem'
            }}>
              {farmer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 style={{ fontWeight: 800, fontSize: '1.35rem', color: '#1A2332' }}>{farmer.name}</h1>
              <p style={{ color: '#6B7A90', fontSize: '0.875rem' }}>📞 {farmer.phone}</p>
              {farmer.address && <p style={{ color: '#6B7A90', fontSize: '0.875rem' }}>📍 {farmer.address}</p>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7A90', marginBottom: '0.25rem' }}>CURRENT BALANCE</p>
            <p style={{ fontSize: '1.6rem', fontWeight: 800 }} className={balance < 0 ? 'balance-negative' : balance > 0 ? 'balance-positive' : ''}>
              {balance < 0 ? `−${formatCurrency(Math.abs(balance))}` : formatCurrency(balance)}
            </p>
            <p style={{ fontSize: '0.78rem', color: '#6B7A90' }}>{balance < 0 ? 'Dues pending' : balance > 0 ? 'Advance given' : 'Settled'}</p>
          </div>
        </div>
      </div>

      {/* Summary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Collected', value: `${formatLiters(totalLiters)} L`, icon: '🥛', bg: '#F0FDF4', color: '#0F6E56' },
          { label: 'Total Earned', value: formatCurrency(totalEarned), icon: '💰', bg: '#FFF7ED', color: '#EA580C' },
          { label: 'Total Paid', value: formatCurrency(totalPaid), icon: '💸', bg: '#EFF6FF', color: '#2563EB' },
          { label: 'Balance', value: formatCurrency(Math.abs(balance)), icon: balance < 0 ? '🔴' : '🟢', bg: balance < 0 ? '#FEF2F2' : '#F0FDF4', color: balance < 0 ? '#DC2626' : '#16A34A' },
        ].map(c => (
          <div key={c.label} className="stat-card">
            <div className="stat-icon" style={{ background: c.bg }}><span style={{ color: c.color, fontSize: '1.3rem' }}>{c.icon}</span></div>
            <div>
              <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6B7A90', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</p>
              <p style={{ fontSize: '1.1rem', fontWeight: 800 }}>{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button className="btn-primary" onClick={() => setShowCollection(true)}><Droplets size={16} /> Record Collection</button>
        <button className="btn-secondary" onClick={() => setShowPayment(true)}><CreditCard size={16} /> Record Payment</button>
      </div>

      {/* Collections table */}
      <div className="card" style={{ padding: 0, marginBottom: '1.25rem' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E5E9EE', fontWeight: 700 }}>
          Collection History ({collections.length})
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Shift</th><th>Liters</th><th>FAT</th><th>SNF</th>
                <th>Rate/Ltr</th><th>Total</th><th></th>
              </tr>
            </thead>
            <tbody>
              {collections.length === 0 ? (
                <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-icon">🥛</div><p>No collections yet</p></div></td></tr>
              ) : collections.map(c => (
                <tr key={c.id}>
                  <td>{formatDate(c.collection_date)}</td>
                  <td><span className={`badge ${c.shift === 'morning' ? 'badge-orange' : 'badge-blue'}`}>{c.shift}</span></td>
                  <td>{formatLiters(c.quantity_liters)} L</td>
                  <td>{formatFAT(c.fat)}</td>
                  <td>{c.snf}</td>
                  <td>₹{parseFloat(c.rate_per_liter).toFixed(2)}</td>
                  <td><strong>{formatCurrency(c.total_amount)}</strong></td>
                  <td>
                    <button className="btn-ghost btn-sm" style={{ color: '#DC2626' }} onClick={() => setDeleteCol(c)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payments table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E5E9EE', fontWeight: 700 }}>
          Payment History ({payments.length})
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr><th>Date</th><th>Amount</th><th>Mode</th><th>Note</th><th></th></tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state"><div className="empty-state-icon">💸</div><p>No payments yet</p></div></td></tr>
              ) : payments.map(p => (
                <tr key={p.id}>
                  <td>{formatDate(p.payment_date)}</td>
                  <td><strong style={{ color: '#16A34A' }}>{formatCurrency(p.amount)}</strong></td>
                  <td><span className="badge badge-green">{formatPaymentMode(p.payment_mode)}</span></td>
                  <td style={{ color: '#6B7A90' }}>{p.note || '—'}</td>
                  <td>
                    <button className="btn-ghost btn-sm" style={{ color: '#DC2626' }} onClick={() => setDeletePay(p)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCollection && (
        <CollectionModal
          onClose={() => setShowCollection(false)}
          onSaved={fetchAll}
          farmers={farmers}
          slabs={slabs}
          prefillFarmerId={id}
        />
      )}
      {showPayment && (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          onSaved={fetchAll}
          farmers={farmers}
          prefillFarmerId={id}
        />
      )}
      {deleteCol && (
        <ConfirmDialog title="Delete Collection"
          message={`Delete collection of ${formatLiters(deleteCol.quantity_liters)}L on ${formatDate(deleteCol.collection_date)}?`}
          onConfirm={handleDeleteCol} onCancel={() => setDeleteCol(null)} confirmLabel="Delete" />
      )}
      {deletePay && (
        <ConfirmDialog title="Delete Payment"
          message={`Delete payment of ${formatCurrency(deletePay.amount)} on ${formatDate(deletePay.payment_date)}?`}
          onConfirm={handleDeletePay} onCancel={() => setDeletePay(null)} confirmLabel="Delete" />
      )}
    </div>
  )
}
