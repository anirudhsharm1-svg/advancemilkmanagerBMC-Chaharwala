import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, formatDate, todayStr } from '../utils/formatters'
import { calculateMilkRate } from '../utils/rateCalculator'
import FarmerSelect from './FarmerSelect'
import toast from 'react-hot-toast'
import { X, Sun, Moon } from 'lucide-react'

const EMPTY = {
  farmer_id: '', collection_date: todayStr(), shift: 'morning',
  quantity_liters: '', fat: '', snf: '', milk_type: 'cow',
}

export default function CollectionModal({ onClose, onSaved, farmers = [], slabs = [], prefillFarmerId = null }) {
  const [form, setForm] = useState({ ...EMPTY, farmer_id: prefillFarmerId || '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [calc, setCalc] = useState({ rate: 0, total: 0, found: false })
  const [customRates, setCustomRates] = useState(null)

  // Load custom rates
  useEffect(() => {
    const loadCustom = async () => {
      const { data } = await supabase.from('farmers').select('address').eq('code', 'SYSTEM_RATES').maybeSingle()
      if (data?.address) {
        try {
          setCustomRates(JSON.parse(data.address))
        } catch (e) {
          console.error(e)
        }
      }
    }
    loadCustom()
  }, [])

  // Live calculation
  useEffect(() => {
    const { fat, snf, quantity_liters, milk_type } = form
    if (fat && snf && quantity_liters) {
      const result = calculateMilkRate(parseFloat(fat), parseInt(snf), parseFloat(quantity_liters), slabs, milk_type, customRates)
      setCalc(result)
    } else {
      setCalc({ rate: 0, total: 0, found: false })
    }
  }, [form.fat, form.snf, form.quantity_liters, form.milk_type, slabs, customRates])

  const set = (key, val) => {
    setForm(p => ({ ...p, [key]: val }))
    setErrors(p => ({ ...p, [key]: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.farmer_id) e.farmer_id = 'Select a farmer'
    if (!form.collection_date) e.collection_date = 'Date required'
    if (!form.quantity_liters || isNaN(form.quantity_liters) || parseFloat(form.quantity_liters) <= 0) e.quantity_liters = 'Valid quantity required'
    if (!form.fat || isNaN(form.fat) || parseFloat(form.fat) <= 0) e.fat = 'Valid FAT required'
    if (!form.snf) e.snf = 'Select SNF value'
    if (form.fat && form.snf && !calc.found) e.snf = 'No rate slab found for this SNF value'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    const payload = {
      farmer_id: form.farmer_id,
      collection_date: form.collection_date,
      shift: form.shift,
      quantity_liters: parseFloat(form.quantity_liters),
      fat: parseFloat(form.fat),
      snf: parseInt(form.snf),
      rate_per_liter: calc.rate,
      total_amount: calc.total,
      milk_type: form.milk_type,
    }
    const { error: insErr } = await supabase.from('milk_collections').insert(payload)
    if (insErr) { toast.error(insErr.message); setSaving(false); return }

    // Update farmer balance (add total_amount as dues — negative means farmer owes)
    const farmer = farmers.find(f => f.id === form.farmer_id)
    const newBalance = (parseFloat(farmer?.balance || 0)) - calc.total
    await supabase.from('farmers').update({ balance: newBalance }).eq('id', form.farmer_id)

    toast.success('Collection recorded!')
    setSaving(false)
    onSaved?.()
    onClose()
  }

  let snfOptions = slabs
    .filter(s => form.milk_type === 'buffalo' ? s.snf_value >= 100 : s.snf_value < 100)
    .map(s => form.milk_type === 'buffalo' ? s.snf_value - 100 : s.snf_value)
    .sort((a, b) => a - b)

  if (snfOptions.length === 0) {
    snfOptions = [82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92]
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>Record Milk Collection</h2>
          <button className="btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Farmer</label>
            <FarmerSelect
              farmers={farmers}
              value={form.farmer_id}
              onChange={v => set('farmer_id', v)}
              placeholder="Select farmer…"
            />
            {errors.farmer_id && <span className="form-error">{errors.farmer_id}</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" className={`input${errors.collection_date ? ' error' : ''}`}
                value={form.collection_date} onChange={e => set('collection_date', e.target.value)} />
              {errors.collection_date && <span className="form-error">{errors.collection_date}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Shift</label>
              <div className="shift-toggle">
                <button type="button" className={`shift-btn${form.shift === 'morning' ? ' active' : ''}`}
                  onClick={() => set('shift', 'morning')}>
                  <Sun size={14} /> Morning
                </button>
                <button type="button" className={`shift-btn${form.shift === 'evening' ? ' active' : ''}`}
                  onClick={() => set('shift', 'evening')}>
                  <Moon size={14} /> Evening
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Milk Type</label>
              <select className="input" value={form.milk_type} onChange={e => set('milk_type', e.target.value)}>
                <option value="cow">Cow</option>
                <option value="buffalo">Buffalo</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Quantity (Liters)</label>
              <input type="number" step="0.01" className={`input${errors.quantity_liters ? ' error' : ''}`}
                placeholder="e.g. 12.50" value={form.quantity_liters}
                onChange={e => set('quantity_liters', e.target.value)} />
              {errors.quantity_liters && <span className="form-error">{errors.quantity_liters}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">FAT Value</label>
              <input type="number" step="0.1" className={`input${errors.fat ? ' error' : ''}`}
                placeholder="e.g. 5.3" value={form.fat}
                onChange={e => set('fat', e.target.value)} />
              {errors.fat && <span className="form-error">{errors.fat}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">SNF Value</label>
              <select className={`input${errors.snf ? ' error' : ''}`}
                value={form.snf} onChange={e => set('snf', e.target.value)}>
                <option value="">Select SNF…</option>
                {snfOptions.map(s => <option key={s} value={s}>{s / 10}%</option>)}
              </select>
              {errors.snf && <span className="form-error">{errors.snf}</span>}
            </div>
          </div>

          {calc.found && (
            <div className="rate-preview">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 600, marginBottom: '0.2rem' }}>CALCULATED RATE</p>
                  <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F6E56' }}>₹{calc.rate.toFixed(2)} / ltr</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 600, marginBottom: '0.2rem' }}>TOTAL AMOUNT</p>
                  <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F6E56' }}>{formatCurrency(calc.total)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Record Collection'}
          </button>
        </div>
      </div>
    </div>
  )
}

