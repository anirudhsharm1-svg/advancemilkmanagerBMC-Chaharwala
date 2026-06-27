import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, formatDate, formatFAT, formatLiters, todayStr } from '../utils/formatters'
import { calculateMilkRate } from '../utils/rateCalculator'
import ConfirmDialog from '../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { Plus, Trash2, Sun, Moon, Calendar, ArrowLeft, RefreshCw, Milk } from 'lucide-react'

export default function Collections() {
  // Master data
  const [farmers, setFarmers] = useState([])
  const [slabs, setSlabs] = useState([])
  const [customRates, setCustomRates] = useState(null)
  const [loading, setLoading] = useState(true)

  // Active Session state
  const [sessionDate, setSessionDate] = useState('')
  const [sessionShift, setSessionShift] = useState('')
  const [collections, setCollections] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Selector temp state
  const [tempDate, setTempDate] = useState(todayStr())
  const [tempShift, setTempShift] = useState('morning')

  // Form state
  const [memberCode, setMemberCode] = useState('')
  const [selectedFarmer, setSelectedFarmer] = useState(null)
  const [quantity, setQuantity] = useState('')
  const [fat, setFat] = useState('')
  const [snf, setSnf] = useState('')
  const [milkType, setMilkType] = useState('cow')
  const [calcRate, setCalcRate] = useState(0)
  const [calcTotal, setCalcTotal] = useState(0)
  const [saving, setSaving] = useState(false)

  const codeInputRef = useRef(null)

  // 1. Fetch Master Data
  const loadMasterData = async () => {
    setLoading(true)
    const [farmRes, slabRes, customRatesRes] = await Promise.all([
      supabase.from('farmers').select('*').neq('code', 'SYSTEM_RATES').order('name'),
      supabase.from('snf_slabs').select('*'),
      supabase.from('farmers').select('address').eq('code', 'SYSTEM_RATES').maybeSingle()
    ])
    setFarmers(farmRes.data || [])
    setSlabs(slabRes.data || [])
    if (customRatesRes.data && customRatesRes.data.address) {
      try {
        setCustomRates(JSON.parse(customRatesRes.data.address))
      } catch (e) {
        console.error('Failed to parse custom rates:', e)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    loadMasterData()
  }, [])

  // 2. Fetch Session collections
  const fetchCollections = async (date, shift) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('milk_collections')
      .select('*, farmers(name, phone, code)')
      .eq('collection_date', date)
      .eq('shift', shift)
      .order('created_at', { ascending: false })
    if (error) {
      toast.error('Failed to load daily transactions')
    } else {
      setCollections(data || [])
    }
    setLoading(false)
  }

  // 3. Lookup farmer dynamically when memberCode changes
  useEffect(() => {
    const cleanCode = memberCode.trim().toLowerCase()
    if (!cleanCode) {
      setSelectedFarmer(null)
      return
    }
    const match = farmers.find(f => f.code?.trim().toLowerCase() === cleanCode)
    setSelectedFarmer(match || null)
  }, [memberCode, farmers])

  // 4. Live Rate Calculation & Auto Milk Type Detection
  useEffect(() => {
    if (fat && snf && quantity) {
      const fatVal = parseFloat(fat)
      const snfVal = parseFloat(snf)
      const qtyVal = parseFloat(quantity)

      if (!isNaN(fatVal)) {
        const detectedType = fatVal <= 5.0 ? 'cow' : 'buffalo'
        if (milkType !== detectedType) {
          setMilkType(detectedType)
        }

        const normalizedSnf = snfVal < 15 ? Math.round(snfVal * 10) : Math.round(snfVal)
        const result = calculateMilkRate(fatVal, normalizedSnf, qtyVal, slabs, detectedType, customRates)
        setCalcRate(result.rate)
        setCalcTotal(result.total)
      }
    } else {
      setCalcRate(0)
      setCalcTotal(0)
      if (fat) {
        const fatVal = parseFloat(fat)
        if (!isNaN(fatVal)) {
          const detectedType = fatVal <= 5.0 ? 'cow' : 'buffalo'
          if (milkType !== detectedType) {
            setMilkType(detectedType)
          }
        }
      }
    }
  }, [fat, snf, quantity, slabs, customRates, milkType])

  // Start Session handler
  const startSession = () => {
    if (!tempDate) {
      toast.error('Please select a date')
      return
    }
    if (!tempShift) {
      toast.error('Please select a shift')
      return
    }
    setSessionDate(tempDate)
    setSessionShift(tempShift)
    fetchCollections(tempDate, tempShift)
    
    // Auto-focus code input after layout transition
    setTimeout(() => {
      if (codeInputRef.current) codeInputRef.current.focus()
    }, 100)
  }

  // Change Session Info
  const resetSession = () => {
    setSessionDate('')
    setSessionShift('')
    setCollections([])
    setMemberCode('')
    setQuantity('')
    setFat('')
    setSnf('')
  }

  // 5. Submit Transaction
  const handleAddTransaction = async (e) => {
    e.preventDefault()
    if (!selectedFarmer) {
      toast.error('Invalid member code or farmer not found')
      return
    }
    if (!quantity || isNaN(quantity) || parseFloat(quantity) <= 0) {
      toast.error('Please enter valid quantity')
      return
    }
    if (!fat || isNaN(fat) || parseFloat(fat) <= 0) {
      toast.error('Please enter valid FAT value')
      return
    }
    if (!snf || isNaN(snf) || parseFloat(snf) <= 0) {
      toast.error('Please enter valid SNF value')
      return
    }

    const snfVal = parseFloat(snf)
    const normalizedSnf = snfVal < 15 ? Math.round(snfVal * 10) : Math.round(snfVal)

    const result = calculateMilkRate(parseFloat(fat), normalizedSnf, parseFloat(quantity), slabs, milkType, customRates)
    if (!result.found) {
      toast.error('No matching SNF rate slab found in system settings')
      return
    }

    setSaving(true)
    const payload = {
      farmer_id: selectedFarmer.id,
      collection_date: sessionDate,
      shift: sessionShift,
      quantity_liters: parseFloat(quantity),
      fat: parseFloat(fat),
      snf: normalizedSnf,
      rate_per_liter: calcRate,
      total_amount: calcTotal,
    }

    try {
      // Robust insertion for milk_type fallback
      const { error: insErr } = await supabase.from('milk_collections').insert({ ...payload, milk_type: milkType })
      if (insErr) {
        if (insErr.message.includes('column') || insErr.code === 'PGRST204') {
          const { error: retryErr } = await supabase.from('milk_collections').insert(payload)
          if (retryErr) throw retryErr
        } else {
          throw insErr
        }
      }

      // Update farmer balance (deduct collection amount)
      const newBalance = parseFloat(selectedFarmer.balance || 0) - calcTotal
      await supabase.from('farmers').update({ balance: newBalance }).eq('id', selectedFarmer.id)
      
      // Update local master state to keep balances sync'd
      setFarmers(prev => prev.map(f => f.id === selectedFarmer.id ? { ...f, balance: newBalance } : f))

      toast.success('Transaction added successfully!')
      
      // Reset inputs
      setMemberCode('')
      setQuantity('')
      setFat('')
      setSnf('')
      
      // Refresh daily transactions
      fetchCollections(sessionDate, sessionShift)

      // Keep focus on member code field
      if (codeInputRef.current) {
        codeInputRef.current.focus()
      }
    } catch (err) {
      toast.error(err.message || 'Failed to save transaction')
    } finally {
      setSaving(false)
    }
  }

  // 6. Delete Transaction
  const handleDelete = async () => {
    if (!deleteTarget) return
    const col = deleteTarget
    const { error } = await supabase.from('milk_collections').delete().eq('id', col.id)
    setDeleteTarget(null)
    if (error) {
      toast.error(error.message)
      return
    }

    // Refund/Update farmer balance
    const farmer = farmers.find(f => f.id === col.farmer_id)
    if (farmer) {
      const newBalance = parseFloat(farmer.balance || 0) + parseFloat(col.total_amount)
      await supabase.from('farmers').update({ balance: newBalance }).eq('id', col.farmer_id)
      setFarmers(prev => prev.map(f => f.id === col.farmer_id ? { ...f, balance: newBalance } : f))
    }

    toast.success('Transaction deleted')
    fetchCollections(sessionDate, sessionShift)
  }

  // Statistics calculation for the active table
  const totalQty = collections.reduce((s, c) => s + parseFloat(c.quantity_liters || 0), 0)
  const totalFatKg = collections.reduce((s, c) => s + (parseFloat(c.quantity_liters || 0) * parseFloat(c.fat || 0)) / 100, 0)
  const totalSnfKg = collections.reduce((s, c) => s + (parseFloat(c.quantity_liters || 0) * (parseInt(c.snf || 0, 10) / 10)) / 100, 0)
  const totalAmount = collections.reduce((s, c) => s + parseFloat(c.total_amount || 0), 0)

  const avgFat = totalQty > 0 ? (totalFatKg / totalQty) * 100 : 0
  const avgSnf = totalQty > 0 ? (totalSnfKg / totalQty) * 1000 : 0
  const avgRate = totalQty > 0 ? totalAmount / totalQty : 0

  // Selector Screen View
  if (!sessionDate || !sessionShift) {
    return (
      <div style={{
        maxWidth: 520, margin: '4rem auto', padding: '2.5rem 2rem',
        background: 'white', borderRadius: 16, border: '1px solid var(--border)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.05)', textAlign: 'center'
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, #0F6E56, #12836A)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem',
          color: 'white', fontSize: '1.5rem'
        }}>
          🥛
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          Milk Collections Manager
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '2rem' }}>
          Select session date and shift to record transactions
        </p>

        <div className="form-group" style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
          <label className="form-label">Session Date</label>
          <div style={{ position: 'relative' }}>
            <input type="date" className="input" value={tempDate} onChange={e => setTempDate(e.target.value)} />
          </div>
        </div>

        <div className="form-group" style={{ textAlign: 'left', marginBottom: '2rem' }}>
          <label className="form-label">Session Shift</label>
          <div className="shift-toggle">
            <button type="button" className={`shift-btn${tempShift === 'morning' ? ' active' : ''}`}
              onClick={() => setTempShift('morning')} style={{ gap: '0.5rem' }}>
              <Sun size={15} /> Morning Shift
            </button>
            <button type="button" className={`shift-btn${tempShift === 'evening' ? ' active' : ''}`}
              onClick={() => setTempShift('evening')} style={{ gap: '0.5rem' }}>
              <Moon size={15} /> Evening Shift
            </button>
          </div>
        </div>

        <button className="btn-primary" onClick={startSession} style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}>
          Start Collection Session
        </button>
      </div>
    )
  }

  // Dashboard Page View
  return (
    <div>
      {/* Session Title Bar */}
      <div style={{
        background: '#0F6E56', color: 'white', borderRadius: 12, padding: '1rem 1.5rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem',
        boxShadow: '0 4px 15px rgba(15,110,86,0.15)', flexWrap: 'wrap', gap: '1rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🥛</span> New Daily Transaction
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.78)', margin: '0.15rem 0 0 0' }}>
            Society Code: 2002 | Vitta Sahawa Dairy | Operator: Admin
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.72)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Session Details</span>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span className={`badge ${sessionShift === 'morning' ? 'badge-orange' : 'badge-blue'}`} style={{ textTransform: 'capitalize', fontSize: '0.7rem' }}>
                {sessionShift}
              </span>
              <span>·</span>
              <span>{formatDate(sessionDate)}</span>
            </p>
          </div>
          <button className="btn-secondary" onClick={resetSession} style={{
            borderColor: 'white', color: 'white', padding: '0.35rem 0.85rem', fontSize: '0.8rem',
            background: 'rgba(255,255,255,0.08)'
          }}>
            <ArrowLeft size={13} /> Change Date & Shift
          </button>
        </div>
      </div>

      {/* Transaction Entry Form */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
          Record Milk Quantity & Quality
        </h3>

        <form onSubmit={handleAddTransaction}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem 1.25rem' }}>
            {/* Left Box: Member Lookup */}
            <div style={{
              background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '1rem',
              display: 'flex', flexDirection: 'column', gap: '0.75rem'
            }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Member Code</label>
                <input
                  id="member-code-input"
                  ref={codeInputRef}
                  className="input"
                  placeholder="Enter Member Code"
                  value={memberCode}
                  onChange={e => setMemberCode(e.target.value)}
                  autoComplete="off"
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Member Name</label>
                <input
                  className="input"
                  style={{ background: '#E2E8F0', cursor: 'not-allowed', fontWeight: 600 }}
                  value={selectedFarmer ? selectedFarmer.name : '—'}
                  placeholder="Farmer name will populate"
                  disabled
                />
              </div>

              <div style={{ marginTop: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>CURRENT BALANCE</span>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.95rem', fontWeight: 700 }}>
                  {selectedFarmer ? (
                    <span className={parseFloat(selectedFarmer.balance) < 0 ? 'balance-negative' : parseFloat(selectedFarmer.balance) > 0 ? 'balance-positive' : ''}>
                      {parseFloat(selectedFarmer.balance) < 0 
                        ? `${formatCurrency(Math.abs(parseFloat(selectedFarmer.balance)))} Due` 
                        : parseFloat(selectedFarmer.balance) > 0 
                        ? `${formatCurrency(parseFloat(selectedFarmer.balance))} Advance` 
                        : '₹0.00'}
                    </span>
                  ) : '—'}
                </p>
              </div>
            </div>

            {/* Right Box: Milk Data Entry */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem 1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Quantity (Ltrs)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  placeholder="e.g. 15.4"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Milk Type (Auto)</label>
                <select
                  className="input"
                  value={milkType}
                  disabled
                  style={{ background: '#F1F5F9', color: '#475569', cursor: 'not-allowed', fontWeight: 600 }}
                >
                  <option value="cow">Cow (≤ 5.0 FAT)</option>
                  <option value="buffalo">Buffalo (≥ 5.1 FAT)</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Fat (%)</label>
                <input
                  type="number"
                  step="0.1"
                  className="input"
                  placeholder="e.g. 4.5"
                  value={fat}
                  onChange={e => setFat(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>SNF (%)</label>
                <input
                  type="number"
                  step="1"
                  className="input"
                  placeholder="e.g. 88"
                  value={snf}
                  onChange={e => setSnf(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Price Preview & Submit */}
            <div style={{
              background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '1rem',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#166534' }}>RATE PER LITRE</span>
                  <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F6E56' }}>
                    ₹{calcRate.toFixed(2)}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#166534' }}>TOTAL AMOUNT</span>
                  <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F6E56' }}>
                    {formatCurrency(calcTotal)}
                  </p>
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={saving || !selectedFarmer}
                style={{ width: '100%', justifyContent: 'center', padding: '0.7rem' }}
              >
                {saving ? 'Recording...' : 'Add Transaction'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Daily Transactions Table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Session Collections Ledger
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.1rem 0 0 0' }}>
              Showing {collections.length} entries for current date & shift
            </p>
          </div>
          <button className="btn-ghost btn-sm" onClick={() => fetchCollections(sessionDate, sessionShift)} style={{ gap: '0.4rem' }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {loading && collections.length === 0 ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : collections.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🥛</div>
            <p>No transactions recorded for this session yet.</p>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>Member Code</th>
                  <th>Member Name</th>
                  <th>Milk Type</th>
                  <th>Quantity</th>
                  <th>Fat (%)</th>
                  <th>SNF (%)</th>
                  <th>Fat Kg</th>
                  <th>SNF Kg</th>
                  <th>Rate/Ltr</th>
                  <th>Total Amount</th>
                  <th style={{ width: '8%', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {collections.map(c => {
                  const itemFatKg = (parseFloat(c.quantity_liters) * parseFloat(c.fat)) / 100
                  const itemSnfKg = (parseFloat(c.quantity_liters) * (parseInt(c.snf, 10) / 10)) / 100
                  return (
                    <tr key={c.id}>
                      <td><strong style={{ color: '#475569' }}>{c.farmers?.code || '—'}</strong></td>
                      <td><strong>{c.farmers?.name || '—'}</strong></td>
                      <td><span className="badge badge-blue" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>{c.milk_type || 'cow'}</span></td>
                      <td>{formatLiters(c.quantity_liters)} L</td>
                      <td>{formatFAT(c.fat)}%</td>
                      <td>{(parseInt(c.snf, 10) / 10).toFixed(1)}%</td>
                      <td>{itemFatKg.toFixed(2)} kg</td>
                      <td>{itemSnfKg.toFixed(2)} kg</td>
                      <td>₹{parseFloat(c.rate_per_liter).toFixed(2)}</td>
                      <td><strong>{formatCurrency(c.total_amount)}</strong></td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn-ghost btn-sm" style={{ color: '#DC2626', padding: '0.25rem' }} onClick={() => setDeleteTarget(c)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {/* Grand Totals Footer */}
                <tr style={{ background: '#F8FAFC', fontWeight: 700, borderTop: '2px solid #CBD5E1', borderBottom: 'none' }}>
                  <td colSpan={3}>GRAND TOTALS</td>
                  <td>{formatLiters(totalQty)} L</td>
                  <td>{avgFat.toFixed(2)}%</td>
                  <td>{(avgSnf / 10).toFixed(2)}%</td>
                  <td>{totalFatKg.toFixed(2)} kg</td>
                  <td>{totalSnfKg.toFixed(2)} kg</td>
                  <td>₹{avgRate.toFixed(2)}</td>
                  <td>{formatCurrency(totalAmount)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Transaction"
          message={`Are you sure you want to delete this collection entry of ${formatLiters(deleteTarget.quantity_liters)}L for farmer ${deleteTarget.farmers?.name || '—'}? Farmer balance will be adjusted accordingly.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          confirmLabel="Delete Entry"
        />
      )}
    </div>
  )
}
