import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, todayStr } from '../utils/formatters'
import FarmerSelect from './FarmerSelect'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'

const EMPTY = { farmer_id: '', amount: '', payment_date: todayStr(), payment_mode: 'cash', note: '' }

export default function PaymentModal({ onClose, onSaved, farmers = [], prefillFarmerId = null }) {
  const [form, setForm] = useState({ ...EMPTY, farmer_id: prefillFarmerId || '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const set = (key, val) => { setForm(p => ({ ...p, [key]: val })); setErrors(p => ({ ...p, [key]: '' })) }

  const validate = () => {
    const e = {}
    if (!form.farmer_id) e.farmer_id = 'Select a farmer'
    if (!form.amount || isNaN(form.amount) || parseFloat(form.amount) <= 0) e.amount = 'Valid amount required'
    if (!form.payment_date) e.payment_date = 'Date required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    const payload = {
      farmer_id: form.farmer_id,
      amount: parseFloat(form.amount),
      payment_date: form.payment_date,
      payment_mode: form.payment_mode,
      note: form.note || null,
    }
    const { error } = await supabase.from('payments').insert(payload)
    if (error) { toast.error(error.message); setSaving(false); return }

    // Update farmer balance (payment reduces dues)
    const farmer = farmers.find(f => f.id === form.farmer_id)
    const newBalance = parseFloat(farmer?.balance || 0) + parseFloat(form.amount)
    await supabase.from('farmers').update({ balance: newBalance }).eq('id', form.farmer_id)

    toast.success('Payment recorded!')
    setSaving(false)
    onSaved?.()
    onClose()
  }

  const selectedFarmer = farmers.find(f => f.id === form.farmer_id)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>Record Payment</h2>
          <button className="btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Farmer</label>
            <FarmerSelect farmers={farmers} value={form.farmer_id} onChange={v => set('farmer_id', v)} />
            {errors.farmer_id && <span className="form-error">{errors.farmer_id}</span>}
          </div>

          {selectedFarmer && (
            <div style={{
              background: parseFloat(selectedFarmer.balance) < 0 ? '#FEF2F2' : '#F0FDF4',
              border: `1px solid ${parseFloat(selectedFarmer.balance) < 0 ? '#FECACA' : '#BBF7D0'}`,
              borderRadius: 8, padding: '0.6rem 0.875rem', marginBottom: '0.75rem', fontSize: '0.875rem'
            }}>
              Current Balance:&nbsp;
              <strong className={parseFloat(selectedFarmer.balance) < 0 ? 'balance-negative' : 'balance-positive'}>
                {formatCurrency(Math.abs(selectedFarmer.balance))} {parseFloat(selectedFarmer.balance) < 0 ? '(Due)' : '(Advance)'}
              </strong>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
            <div className="form-group">
              <label className="form-label">Amount (₹)</label>
              <input type="number" step="0.01" className={`input${errors.amount ? ' error' : ''}`}
                placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
              {errors.amount && <span className="form-error">{errors.amount}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" className={`input${errors.payment_date ? ' error' : ''}`}
                value={form.payment_date} onChange={e => set('payment_date', e.target.value)} />
              {errors.payment_date && <span className="form-error">{errors.payment_date}</span>}
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Payment Mode</label>
              <select className="input" value={form.payment_mode} onChange={e => set('payment_mode', e.target.value)}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Note (optional)</label>
              <input type="text" className="input" placeholder="e.g. Weekly payment"
                value={form.note} onChange={e => set('note', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
