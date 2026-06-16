import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, formatDate, formatFAT, formatLiters, getMonthName } from '../utils/formatters'
import toast from 'react-hot-toast'
import { Search, Download, FileText, Printer } from 'lucide-react'

export default function Reports() {
  const [tab, setTab] = useState('daily')
  const [date, setDate] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [loading, setLoading] = useState(false)

  // Report Data
  const [dailyData, setDailyData] = useState([])
  const [monthlyData, setMonthlyData] = useState([])
  const [summary, setSummary] = useState(null)

  // Passbook States
  const [farmers, setFarmers] = useState([])
  const [passbookFarmerId, setPassbookFarmerId] = useState('')
  const [passbookStartDate, setPassbookStartDate] = useState('')
  const [passbookEndDate, setPassbookEndDate] = useState('')
  const [passbookData, setPassbookData] = useState(null)
  const [passbookLoading, setPassbookLoading] = useState(false)
  const [showFatSnfKg, setShowFatSnfKg] = useState(false)

  useEffect(() => {
    const fetchFarmers = async () => {
      const { data, error } = await supabase.from('farmers').select('*').order('name')
      if (!error) setFarmers(data || [])
    }
    fetchFarmers()
  }, [])

  const fetchPassbookData = async () => {
    if (!passbookFarmerId || !passbookStartDate || !passbookEndDate) {
      toast.error('Please select farmer and date range')
      return
    }
    setPassbookLoading(true)

    // Fetch collections
    const { data: collections, error: colError } = await supabase
      .from('milk_collections')
      .select('*')
      .eq('farmer_id', passbookFarmerId)
      .gte('collection_date', passbookStartDate)
      .lte('collection_date', passbookEndDate)
      .order('collection_date', { ascending: true })

    // Fetch payments (Deductions)
    const { data: payments, error: payError } = await supabase
      .from('payments')
      .select('*')
      .eq('farmer_id', passbookFarmerId)
      .gte('payment_date', passbookStartDate)
      .lte('payment_date', passbookEndDate)
      .order('payment_date', { ascending: true })

    if (colError || payError) {
      toast.error('Failed to fetch passbook data')
      setPassbookLoading(false)
      return
    }

    // Process collections: group by date
    const groupedByDate = {}
    let totalLiters = 0
    let totalAmt = 0
    let totalFatProducts = 0
    let totalSNFProducts = 0
    let totalRateProducts = 0
    let totalFatKg = 0
    let totalSNFKg = 0

    collections.forEach(col => {
      const dateStr = col.collection_date
      if (!groupedByDate[dateStr]) {
        groupedByDate[dateStr] = {
          date: dateStr,
          morning: null,
          evening: null,
          totalQty: 0,
          totalAmt: 0
        }
      }

      const qty = parseFloat(col.quantity_liters)
      const amt = parseFloat(col.total_amount)
      const fat = parseFloat(col.fat)
      const snf = parseFloat(col.snf)
      const rate = parseFloat(col.rate_per_liter)
      
      const fatKg = (fat * qty) / 100
      const snfKg = ((snf >= 80 ? snf / 10 : snf) * qty) / 100

      if (col.shift === 'morning') {
        groupedByDate[dateStr].morning = { qty, fat, snf, rate, amt, fatKg, snfKg }
      } else {
        groupedByDate[dateStr].evening = { qty, fat, snf, rate, amt, fatKg, snfKg }
      }

      groupedByDate[dateStr].totalQty += qty
      groupedByDate[dateStr].totalAmt += amt

      totalLiters += qty
      totalAmt += amt
      totalFatProducts += fat * qty
      totalSNFProducts += snf * qty
      totalRateProducts += rate * qty
      totalFatKg += fatKg
      totalSNFKg += snfKg
    })

    const dailyRows = Object.values(groupedByDate).sort((a, b) => new Date(a.date) - new Date(b.date))

    // Calculate averages
    const avgFat = totalLiters > 0 ? (totalFatProducts / totalLiters) : 0
    const avgSNF = totalLiters > 0 ? (totalSNFProducts / totalLiters) : 0
    const avgRate = totalLiters > 0 ? (totalRateProducts / totalLiters) : 0

    // Shift level totals & averages
    let mQty = 0, mAmt = 0, mFatProd = 0, mSnfProd = 0, mFatKg = 0, mSnfKg = 0
    let eQty = 0, eAmt = 0, eFatProd = 0, eSnfProd = 0, eFatKg = 0, eSnfKg = 0

    dailyRows.forEach(r => {
      if (r.morning) {
        mQty += r.morning.qty
        mAmt += r.morning.amt
        mFatProd += r.morning.fat * r.morning.qty
        mSnfProd += r.morning.snf * r.morning.qty
        mFatKg += r.morning.fatKg
        mSnfKg += r.morning.snfKg
      }
      if (r.evening) {
        eQty += r.evening.qty
        eAmt += r.evening.amt
        eFatProd += r.evening.fat * r.evening.qty
        eSnfProd += r.evening.snf * r.evening.qty
        eFatKg += r.evening.fatKg
        eSnfKg += r.evening.snfKg
      }
    })

    const mAvgFat = mQty > 0 ? (mFatProd / mQty) : 0
    const mAvgSnf = mQty > 0 ? (mSnfProd / mQty) : 0
    const eAvgFat = eQty > 0 ? (eFatProd / eQty) : 0
    const eAvgSnf = eQty > 0 ? (eSnfProd / eQty) : 0

    // Total Payments
    const totalPayments = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0)
    const netPayable = totalAmt - totalPayments

    const selectedFarmer = farmers.find(f => f.id === passbookFarmerId)

    setPassbookData({
      farmer: selectedFarmer,
      rows: dailyRows,
      payments: payments || [],
      summary: {
        totalLiters,
        totalAmt,
        avgFat,
        avgSNF,
        avgRate,
        totalPayments,
        netPayable,
        totalFatKg,
        totalSNFKg,
        mQty,
        mAmt,
        mAvgFat,
        mAvgSnf,
        mFatKg,
        mSnfKg,
        eQty,
        eAmt,
        eAvgFat,
        eAvgSnf,
        eFatKg,
        eSnfKg
      }
    })

    if (selectedFarmer) {
      setShowFatSnfKg(!!selectedFarmer.show_fat_snf_kg)
    }

    setPassbookLoading(false)
  }

  const fetchDaily = async () => {
    if (!date) { toast.error('Please select a date'); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('milk_collections')
      .select('*, farmers(name)')
      .eq('collection_date', date)
      .order('shift')
      .order('created_at')

    if (error) {
      toast.error('Failed to fetch daily report')
    } else {
      setDailyData(data || [])
      setSummary({
        liters: data.reduce((s, c) => s + parseFloat(c.quantity_liters), 0),
        amount: data.reduce((s, c) => s + parseFloat(c.total_amount), 0),
        morningLiters: data.filter(c => c.shift === 'morning').reduce((s, c) => s + parseFloat(c.quantity_liters), 0),
        eveningLiters: data.filter(c => c.shift === 'evening').reduce((s, c) => s + parseFloat(c.quantity_liters), 0),
      })
    }
    setLoading(false)
  }

  const fetchMonthly = async () => {
    if (!month || !year) { toast.error('Please select month and year'); return }
    setLoading(true)
    const prefix = `${year}-${String(month).padStart(2, '0')}`

    const [colRes, payRes, expRes, farmersRes] = await Promise.all([
      supabase.from('milk_collections').select('*').like('collection_date', `${prefix}%`),
      supabase.from('payments').select('*').like('payment_date', `${prefix}%`),
      supabase.from('expenses').select('*').like('expense_date', `${prefix}%`),
      supabase.from('farmers').select('*'),
    ])

    const collections = colRes.data || []
    const payments = payRes.data || []
    const expenses = expRes.data || []
    const farmers = farmersRes.data || []

    const farmerMap = new Map(farmers.map(f => [f.id, { ...f, cLiters: 0, cAmount: 0, pAmount: 0 }]))

    collections.forEach(c => {
      const f = farmerMap.get(c.farmer_id)
      if (f) { f.cLiters += parseFloat(c.quantity_liters); f.cAmount += parseFloat(c.total_amount) }
    })
    payments.forEach(p => {
      const f = farmerMap.get(p.farmer_id)
      if (f) { f.pAmount += parseFloat(p.amount) }
    })

    const report = Array.from(farmerMap.values()).filter(f => f.cLiters > 0 || f.pAmount > 0)
    setMonthlyData(report)

    const rev = collections.reduce((s, c) => s + parseFloat(c.total_amount), 0)
    const exp = expenses.reduce((s, e) => s + parseFloat(e.amount), 0)
    setSummary({
      revenue: rev,
      expenses: exp,
      profit: rev - exp,
      liters: collections.reduce((s, c) => s + parseFloat(c.quantity_liters), 0),
      paid: payments.reduce((s, p) => s + parseFloat(p.amount), 0)
    })
    setLoading(false)
  }

  const exportDailyCSV = () => {
    const rows = [['Shift', 'Farmer', 'Liters', 'FAT', 'SNF', 'Rate/Ltr', 'Total']]
    dailyData.forEach(c => rows.push([c.shift, c.farmers?.name || '', c.quantity_liters, c.fat, c.snf, c.rate_per_liter, c.total_amount]))
    const csv = rows.map(r => r.join(',')).join('\n')
    downloadCSV(csv, `Daily_Report_${date}.csv`)
  }

  const exportMonthlyCSV = () => {
    const rows = [['Farmer', 'Total Liters', 'Total Value', 'Total Paid', 'Current Balance']]
    monthlyData.forEach(f => rows.push([f.name, f.cLiters, f.cAmount, f.pAmount, f.balance]))
    const csv = rows.map(r => r.join(',')).join('\n')
    downloadCSV(csv, `Monthly_Report_${getMonthName(month)}_${year}.csv`)
  }

  const downloadCSV = (csv, filename) => {
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported to CSV!')
  }

  const formatSNF = (val) => {
    if (val === null || val === undefined) return '-'
    const num = parseFloat(val)
    if (num < 15) return (num * 100).toFixed(0)
    if (num < 150) return (num * 10).toFixed(0)
    return num.toFixed(0)
  }

  const loadHtml2Pdf = () => {
    return new Promise((resolve) => {
      if (window.html2pdf) {
        resolve(window.html2pdf)
        return
      }
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
      script.onload = () => resolve(window.html2pdf)
      document.body.appendChild(script)
    })
  }

  const handleDownloadPDF = async () => {
    const originalElement = document.querySelector('.passbook-container')
    if (!originalElement) return

    const toastId = toast.loading('Generating PDF...')
    try {
      const html2pdf = await loadHtml2Pdf()
      const farmerName = passbookData?.farmer?.name || 'Farmer'

      // Store original styles to restore later
      const originalWidth = originalElement.style.width
      const originalMaxWidth = originalElement.style.maxWidth
      const originalPadding = originalElement.style.padding
      const originalBackground = originalElement.style.background
      const originalBorder = originalElement.style.border
      const originalBoxShadow = originalElement.style.boxShadow

      // Temporarily style for clean print layout (forces landscape proportions)
      originalElement.style.width = '1400px'
      originalElement.style.maxWidth = 'none'
      originalElement.style.padding = '20px'
      originalElement.style.background = 'white'
      originalElement.style.border = 'none'
      originalElement.style.boxShadow = 'none'

      // Hide all pdf-exclude elements temporarily
      const excludes = originalElement.querySelectorAll('.pdf-exclude')
      const originalDisplays = Array.from(excludes).map(el => el.style.display)
      excludes.forEach(el => el.style.display = 'none')

      const opt = {
        margin: 15,
        filename: `Passbook_${farmerName.replace(/\s+/g, '_')}_${passbookStartDate}_to_${passbookEndDate}.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: { 
          scale: 2, 
          useCORS: true,
          logging: false,
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: { 
          unit: 'pt', 
          format: 'a4', 
          orientation: 'landscape' 
        }
      }
      
      await html2pdf().from(originalElement).set(opt).save()
      
      // Restore original styles and visibility
      originalElement.style.width = originalWidth
      originalElement.style.maxWidth = originalMaxWidth
      originalElement.style.padding = originalPadding
      originalElement.style.background = originalBackground
      originalElement.style.border = originalBorder
      originalElement.style.boxShadow = originalBoxShadow
      excludes.forEach((el, idx) => el.style.display = originalDisplays[idx])
      
      toast.success('PDF Downloaded!', { id: toastId })
    } catch (error) {
      toast.error('Failed to generate PDF', { id: toastId })
      console.error(error)
    }
  }

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="page-subtitle">Generate and export financial reports</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #E5E9EE' }} className="no-print">
        <button
          className={`nav-item ${tab === 'daily' ? 'active' : ''}`}
          style={{ width: 'auto', borderRadius: '10px 10px 0 0', background: tab === 'daily' ? '#0F6E56' : 'transparent', color: tab === 'daily' ? 'white' : '#6B7A90', fontWeight: 600, padding: '0.75rem 1.5rem' }}
          onClick={() => { setTab('daily'); setSummary(null); setDailyData([]); setPassbookData(null) }}
        >
          Daily Collection
        </button>
        <button
          className={`nav-item ${tab === 'monthly' ? 'active' : ''}`}
          style={{ width: 'auto', borderRadius: '10px 10px 0 0', background: tab === 'monthly' ? '#0F6E56' : 'transparent', color: tab === 'monthly' ? 'white' : '#6B7A90', fontWeight: 600, padding: '0.75rem 1.5rem' }}
          onClick={() => { setTab('monthly'); setSummary(null); setMonthlyData([]); setPassbookData(null) }}
        >
          Monthly Summary
        </button>
        <button
          className={`nav-item ${tab === 'passbook' ? 'active' : ''}`}
          style={{ width: 'auto', borderRadius: '10px 10px 0 0', background: tab === 'passbook' ? '#0F6E56' : 'transparent', color: tab === 'passbook' ? 'white' : '#6B7A90', fontWeight: 600, padding: '0.75rem 1.5rem' }}
          onClick={() => { setTab('passbook'); setSummary(null); setPassbookData(null) }}
        >
          Member Passbook
        </button>
      </div>

      {tab === 'daily' && (
        <div>
          <div className="filters-row" style={{ background: 'white', padding: '1rem', borderRadius: 12, border: '1px solid #E5E9EE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input type="date" className="input" style={{ width: 200 }} value={date} onChange={e => setDate(e.target.value)} />
              <button className="btn-primary" onClick={fetchDaily} disabled={loading}><Search size={16} /> Generate</button>
              {dailyData.length > 0 && <button className="btn-secondary" onClick={exportDailyCSV}><Download size={16} /> Export CSV</button>}
            </div>
          </div>

          {loading ? <div className="loading-center"><div className="spinner" /></div> : (
            summary && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="stat-card" style={{ background: '#F0FDF4' }}>
                    <div><p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#166534' }}>TOTAL LITERS</p><p style={{ fontWeight: 800, fontSize: '1.4rem', color: '#0F6E56' }}>{formatLiters(summary.liters)} L</p></div>
                  </div>
                  <div className="stat-card" style={{ background: '#FFF7ED' }}>
                    <div><p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#9A3412' }}>TOTAL VALUE</p><p style={{ fontWeight: 800, fontSize: '1.4rem', color: '#EA580C' }}>{formatCurrency(summary.amount)}</p></div>
                  </div>
                  <div className="stat-card">
                    <div><p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7A90' }}>MORNING</p><p style={{ fontWeight: 800, fontSize: '1.4rem' }}>{formatLiters(summary.morningLiters)} L</p></div>
                  </div>
                  <div className="stat-card">
                    <div><p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7A90' }}>EVENING</p><p style={{ fontWeight: 800, fontSize: '1.4rem' }}>{formatLiters(summary.eveningLiters)} L</p></div>
                  </div>
                </div>

                <div className="card" style={{ padding: 0 }}>
                  <div className="table-container">
                    <table>
                      <thead><tr><th>Shift</th><th>Farmer</th><th>Liters</th><th>FAT</th><th>SNF</th><th>Rate</th><th>Total Amount</th></tr></thead>
                      <tbody>
                        {dailyData.length === 0 ? <tr><td colSpan={7}><div className="empty-state"><FileText size={40} style={{ opacity: 0.3 }} /><p>No collections found for this date.</p></div></td></tr> : dailyData.map(c => (
                          <tr key={c.id}>
                            <td><span className={`badge ${c.shift === 'morning' ? 'badge-orange' : 'badge-blue'}`}>{c.shift}</span></td>
                            <td><strong>{c.farmers?.name}</strong></td>
                            <td>{formatLiters(c.quantity_liters)} L</td>
                            <td>{formatFAT(c.fat)}</td>
                            <td>{c.snf}</td>
                            <td>₹{parseFloat(c.rate_per_liter).toFixed(2)}</td>
                            <td><strong>{formatCurrency(c.total_amount)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {tab === 'monthly' && (
        <div>
          <div className="filters-row" style={{ background: 'white', padding: '1rem', borderRadius: 12, border: '1px solid #E5E9EE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <select className="input" style={{ width: 160 }} value={month} onChange={e => setMonth(e.target.value)}>
                <option value="">Select Month</option>
                {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{getMonthName(i+1)}</option>)}
              </select>
              <select className="input" style={{ width: 120 }} value={year} onChange={e => setYear(e.target.value)}>
                <option value="">Year</option>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button className="btn-primary" onClick={fetchMonthly} disabled={loading}><Search size={16} /> Generate</button>
              {monthlyData.length > 0 && <button className="btn-secondary" onClick={exportMonthlyCSV}><Download size={16} /> Export CSV</button>}
            </div>
          </div>

          {loading ? <div className="loading-center"><div className="spinner" /></div> : (
            summary && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="stat-card" style={{ background: '#F0FDF4' }}>
                    <div><p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#166534' }}>REVENUE</p><p style={{ fontWeight: 800, fontSize: '1.3rem', color: '#0F6E56' }}>{formatCurrency(summary.revenue)}</p></div>
                  </div>
                  <div className="stat-card" style={{ background: '#FEF2F2' }}>
                    <div><p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#991B1B' }}>EXPENSES</p><p style={{ fontWeight: 800, fontSize: '1.3rem', color: '#DC2626' }}>{formatCurrency(summary.expenses)}</p></div>
                  </div>
                  <div className="stat-card" style={{ background: '#EFF6FF' }}>
                    <div><p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1E3A8A' }}>NET PROFIT</p><p style={{ fontWeight: 800, fontSize: '1.3rem', color: '#2563EB' }}>{formatCurrency(summary.profit)}</p></div>
                  </div>
                  <div className="stat-card">
                    <div><p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7A90' }}>MILK COLLECTED</p><p style={{ fontWeight: 800, fontSize: '1.3rem' }}>{formatLiters(summary.liters)} L</p></div>
                  </div>
                  <div className="stat-card">
                    <div><p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7A90' }}>TOTAL PAID</p><p style={{ fontWeight: 800, fontSize: '1.3rem' }}>{formatCurrency(summary.paid)}</p></div>
                  </div>
                </div>

                <div className="card" style={{ padding: 0 }}>
                  <div className="table-container">
                    <table>
                      <thead><tr><th>Farmer Name</th><th>Total Liters</th><th>Total Value</th><th>Total Paid</th><th>Current Balance</th></tr></thead>
                      <tbody>
                        {monthlyData.length === 0 ? <tr><td colSpan={5}><div className="empty-state"><FileText size={40} style={{ opacity: 0.3 }} /><p>No activity found for this month.</p></div></td></tr> : monthlyData.map(f => (
                          <tr key={f.id}>
                            <td><strong>{f.name}</strong></td>
                            <td>{formatLiters(f.cLiters)} L</td>
                            <td><strong style={{ color: '#0F6E56' }}>{formatCurrency(f.cAmount)}</strong></td>
                            <td><strong style={{ color: '#16A34A' }}>{formatCurrency(f.pAmount)}</strong></td>
                            <td>
                              <span className={parseFloat(f.balance) < 0 ? 'balance-negative' : parseFloat(f.balance) > 0 ? 'balance-positive' : ''}>
                                {parseFloat(f.balance) < 0 ? `${formatCurrency(Math.abs(f.balance))} Due` : parseFloat(f.balance) > 0 ? `${formatCurrency(f.balance)} Adv` : '₹0.00'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {tab === 'passbook' && (
        <div>
          <div className="filters-row no-print" style={{ background: 'white', padding: '1rem', borderRadius: 12, border: '1px solid #E5E9EE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <select className="input" style={{ width: 220 }} value={passbookFarmerId} onChange={e => {
                const fid = e.target.value
                setPassbookFarmerId(fid)
                const farmer = farmers.find(f => f.id === fid)
                if (farmer) {
                   setShowFatSnfKg(!!farmer.show_fat_snf_kg)
                }
              }}>
                <option value="">Select Farmer</option>
                {farmers.map(f => <option key={f.id} value={f.id}>{f.name} (Phone: {f.phone})</option>)}
              </select>
              <input type="date" className="input" style={{ width: 160 }} value={passbookStartDate} onChange={e => setPassbookStartDate(e.target.value)} />
              <span style={{ color: '#6B7A90', fontWeight: 500 }}>to</span>
              <input type="date" className="input" style={{ width: 160 }} value={passbookEndDate} onChange={e => setPassbookEndDate(e.target.value)} />
              <button className="btn-primary" onClick={fetchPassbookData} disabled={passbookLoading}><Search size={16} /> Generate</button>
              {passbookData && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '0.5rem' }}>
                  <input 
                    type="checkbox" 
                    id="filter_show_fat_snf_kg" 
                    style={{ width: '18px', height: '18px', accentColor: '#0F6E56', cursor: 'pointer' }}
                    checked={showFatSnfKg} 
                    onChange={e => setShowFatSnfKg(e.target.checked)} 
                  />
                  <label htmlFor="filter_show_fat_snf_kg" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                    Show Fat/SNF Kg
                  </label>
                </div>
              )}
              {passbookData && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-secondary" onClick={() => window.print()}><Printer size={16} /> Print</button>
                </div>
              )}
            </div>
          </div>

          {passbookLoading ? <div className="loading-center"><div className="spinner" /></div> : (
            passbookData ? (
              <div className="passbook-container" style={{ marginTop: '1.5rem' }}>
                <div className="passbook-header" style={{ textAlign: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid #0F6E56' }}>
                  <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1A2332', margin: '0 0 0.25rem 0' }}>Vitta Sahawa Dairy</h1>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#475569', margin: '0 0 0.25rem 0' }}>Society code: 2002</h2>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#475569', margin: '0 0 0.25rem 0' }}>Member passbook report</h3>
                  <p style={{ fontSize: '1.0rem', fontWeight: 700, color: '#64748B', margin: '0 0 0.5rem 0' }}>from {formatDate(passbookStartDate)} to {formatDate(passbookEndDate)}</p>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F6E56', background: '#F0FDF4', display: 'inline-block', padding: '0.4rem 1.5rem', borderRadius: '8px', border: '1px solid #DCFCE7', marginTop: '0.25rem' }}>
                    {passbookData.farmer?.name}({passbookData.farmer?.code || 'N/A'})
                  </div>
                </div>

                <div className="passbook-table-wrapper">
                  <table className="passbook-table">
                    <thead>
                      <tr>
                        <th className="header-group" rowSpan={2}>Date</th>
                        <th className="header-group" colSpan={showFatSnfKg ? 7 : 5}>Morning Shift</th>
                        <th className="header-group" colSpan={showFatSnfKg ? 7 : 5}>Evening Shift</th>
                        <th className="header-group" colSpan={2}>Total</th>
                      </tr>
                      <tr>
                        <th>Qty</th>
                        <th>Fat</th>
                        <th>SNF</th>
                        {showFatSnfKg && <><th>Fat Kg</th><th>SNF Kg</th></>}
                        <th>Rate</th>
                        <th>Amt</th>
                        <th>Qty</th>
                        <th>Fat</th>
                        <th>SNF</th>
                        {showFatSnfKg && <><th>Fat Kg</th><th>SNF Kg</th></>}
                        <th>Rate</th>
                        <th>Amt</th>
                        <th>Qty</th>
                        <th>Amt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {passbookData.rows.length === 0 ? (
                        <tr>
                          <td colSpan={showFatSnfKg ? 17 : 13} style={{ padding: '2rem', color: '#6B7A90' }}>No collections recorded in this period.</td>
                        </tr>
                      ) : (
                        passbookData.rows.map(row => (
                          <tr key={row.date}>
                            <td><strong>{formatDate(row.date)}</strong></td>
                            {/* Morning Shift */}
                            {row.morning ? (
                              <>
                                <td>{row.morning.qty.toFixed(1)}</td>
                                <td>{row.morning.fat.toFixed(1)}</td>
                                <td>{formatSNF(row.morning.snf)}</td>
                                {showFatSnfKg && (
                                  <>
                                    <td>{row.morning.fatKg.toFixed(3)}</td>
                                    <td>{row.morning.snfKg.toFixed(3)}</td>
                                  </>
                                )}
                                <td>₹{row.morning.rate.toFixed(2)}</td>
                                <td>₹{row.morning.amt.toFixed(2)}</td>
                              </>
                            ) : (
                              <>
                                <td>-</td><td>-</td><td>-</td>
                                {showFatSnfKg && <><td>-</td><td>-</td></>}
                                <td>-</td><td>-</td>
                              </>
                            )}
                            {/* Evening Shift */}
                            {row.evening ? (
                              <>
                                <td>{row.evening.qty.toFixed(1)}</td>
                                <td>{row.evening.fat.toFixed(1)}</td>
                                <td>{formatSNF(row.evening.snf)}</td>
                                {showFatSnfKg && (
                                  <>
                                    <td>{row.evening.fatKg.toFixed(3)}</td>
                                    <td>{row.evening.snfKg.toFixed(3)}</td>
                                  </>
                                )}
                                <td>₹{row.evening.rate.toFixed(2)}</td>
                                <td>₹{row.evening.amt.toFixed(2)}</td>
                              </>
                            ) : (
                              <>
                                <td>-</td><td>-</td><td>-</td>
                                {showFatSnfKg && <><td>-</td><td>-</td></>}
                                <td>-</td><td>-</td>
                              </>
                            )}
                            {/* Total column */}
                            <td><strong>{row.totalQty.toFixed(1)}</strong></td>
                            <td><strong>₹{row.totalAmt.toFixed(2)}</strong></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      {/* Total Row 1 */}
                      <tr style={{ fontWeight: 'bold', background: '#F8FAFC' }}>
                        <td>Total</td>
                        <td>{passbookData.summary.mQty > 0 ? passbookData.summary.mQty?.toFixed(1) : '-'}</td>
                        <td>{passbookData.summary.mQty > 0 ? passbookData.summary.mAvgFat?.toFixed(1) : '-'}</td>
                        <td>{passbookData.summary.mQty > 0 ? formatSNF(passbookData.summary.mAvgSnf) : '-'}</td>
                        {showFatSnfKg && (
                          <>
                            <td>{passbookData.summary.mQty > 0 ? passbookData.summary.mFatKg?.toFixed(3) : '-'}</td>
                            <td>{passbookData.summary.mQty > 0 ? passbookData.summary.mSnfKg?.toFixed(3) : '-'}</td>
                          </>
                        )}
                        <td></td>
                        <td>{passbookData.summary.mAmt > 0 ? `₹${passbookData.summary.mAmt?.toFixed(2)}` : '-'}</td>
                        <td>{passbookData.summary.eQty > 0 ? passbookData.summary.eQty?.toFixed(1) : '-'}</td>
                        <td>{passbookData.summary.eQty > 0 ? passbookData.summary.eAvgFat?.toFixed(1) : '-'}</td>
                        <td>{passbookData.summary.eQty > 0 ? formatSNF(passbookData.summary.eAvgSnf) : '-'}</td>
                        {showFatSnfKg && (
                          <>
                            <td>{passbookData.summary.eQty > 0 ? passbookData.summary.eFatKg?.toFixed(3) : '-'}</td>
                            <td>{passbookData.summary.eQty > 0 ? passbookData.summary.eSnfKg?.toFixed(3) : '-'}</td>
                          </>
                        )}
                        <td></td>
                        <td>{passbookData.summary.eAmt > 0 ? `₹${passbookData.summary.eAmt?.toFixed(2)}` : '-'}</td>
                        <td>{passbookData.summary.totalLiters?.toFixed(1)}</td>
                        <td>₹{passbookData.summary.totalAmt?.toFixed(2)}</td>
                      </tr>
                      {/* Total Row 2 */}
                      <tr style={{ fontWeight: 'bold', background: '#F8FAFC' }}>
                        <td>Total</td>
                        <td>Fatkg</td>
                        <td>{passbookData.summary.totalFatKg?.toFixed(2)}</td>
                        <td>Snfkg</td>
                        <td>{passbookData.summary.totalSNFKg?.toFixed(1)}</td>
                        {/* Remaining columns dynamically filled */}
                        {showFatSnfKg ? (
                          <>
                            <td></td><td></td><td></td><td></td><td></td>
                            <td></td><td></td><td></td><td></td><td></td>
                            <td></td><td></td>
                          </>
                        ) : (
                          <>
                            <td></td><td></td><td></td><td></td><td></td>
                            <td></td><td></td><td></td>
                          </>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="passbook-summary-row pdf-exclude">
                  <div className="passbook-summary-col">
                    <div className="passbook-summary-item">
                      <span>Total Qty:</span>
                      <span>{passbookData.summary.totalLiters.toFixed(2)} L</span>
                    </div>
                    <div className="passbook-summary-item">
                      <span>Avg SNF:</span>
                      <span>{passbookData.summary.avgSNF.toFixed(2)} %</span>
                    </div>
                    {showFatSnfKg && (
                      <div className="passbook-summary-item">
                        <span>Total Fat Kg:</span>
                        <span>{passbookData.summary.totalFatKg.toFixed(3)} Kg</span>
                      </div>
                    )}
                  </div>
                  <div className="passbook-summary-col">
                    <div className="passbook-summary-item">
                      <span>Avg Fat:</span>
                      <span>{passbookData.summary.avgFat.toFixed(2)} %</span>
                    </div>
                    <div className="passbook-summary-item">
                      <span>Avg Rate:</span>
                      <span>{formatCurrency(passbookData.summary.avgRate)}</span>
                    </div>
                    {showFatSnfKg && (
                      <div className="passbook-summary-item">
                        <span>Total SNF Kg:</span>
                        <span>{passbookData.summary.totalSNFKg.toFixed(3)} Kg</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="passbook-ledger-grid pdf-exclude">
                  {/* Payable Column */}
                  <div className="ledger-block">
                    <div className="ledger-block-header">Payable</div>
                    <table className="ledger-table">
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th style={{ textAlign: 'right' }}>Amount (Rs.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Total Milk Amount</td>
                          <td style={{ textAlign: 'right' }}>{passbookData.summary.totalAmt.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td>Received (Receipt)</td>
                          <td style={{ textAlign: 'right' }}>0.00</td>
                        </tr>
                        <tr className="total-row">
                          <td>Subtotal</td>
                          <td style={{ textAlign: 'right' }}>{passbookData.summary.totalAmt.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Deductions Column */}
                  <div className="ledger-block">
                    <div className="ledger-block-header deductions">Deductions</div>
                    <table className="ledger-table">
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th style={{ textAlign: 'right' }}>Amount (Rs.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {passbookData.payments.length === 0 ? (
                          <tr>
                            <td colSpan={2} style={{ color: '#6B7A90', fontStyle: 'italic', padding: '1rem' }}>No deductions recorded.</td>
                          </tr>
                        ) : (
                          passbookData.payments.map((p, idx) => (
                            <tr key={p.id || idx}>
                              <td>{formatDate(p.payment_date)} {p.note || 'Cash Advance'}</td>
                              <td style={{ textAlign: 'right' }}>{parseFloat(p.amount).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                        <tr className="total-row">
                          <td>Total</td>
                          <td style={{ textAlign: 'right' }}>{passbookData.summary.totalPayments.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="passbook-net-payable-box pdf-exclude">
                  <div className="passbook-net-payable-label">Net Payable</div>
                  <div className="passbook-net-payable-value">Rs. {passbookData.summary.netPayable.toFixed(2)}</div>
                </div>

                <div className="passbook-footer">
                  Have a nice day!
                </div>
              </div>
            ) : (
              <div className="empty-state no-print">
                <FileText size={48} className="empty-state-icon" style={{ margin: '0 auto 1rem' }} />
                <p>Please select a farmer and date range, then click Generate to view the Passbook report.</p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
