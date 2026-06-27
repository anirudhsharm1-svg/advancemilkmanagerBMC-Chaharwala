import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatDate, todayStr } from '../utils/formatters'
import toast from 'react-hot-toast'
import { Save, Plus, Trash2, Settings, FileSpreadsheet, Truck, Printer, Pencil, Check, X } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'

const MILK_TYPES = [
  { value: 'b', label: 'b' },
  { value: 'c', label: 'c' },
  { value: 'p', label: 'p' },
  { value: 'l', label: 'l' }
]

export default function RouteDispatch() {
  const [activeTab, setActiveTab] = useState('entry') // 'entry' or 'settings'
  const [routes, setRoutes] = useState([])
  const [societies, setSocieties] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [masterDataVersion, setMasterDataVersion] = useState(0)

  // Filters
  const [selectedRouteId, setSelectedRouteId] = useState('')
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [selectedShift, setSelectedShift] = useState('morning')

  // Spreadsheet Grid Rows State
  const [gridRows, setGridRows] = useState([])

  // Settings Forms
  const [newRoute, setNewRoute] = useState({ name: '', code: '' })
  const [newSociety, setNewSociety] = useState({ route_id: '', code: '', name: '' })

  // Master lists for settings tab
  const [deleteTargetRoute, setDeleteTargetRoute] = useState(null)
  const [deleteTargetSociety, setDeleteTargetSociety] = useState(null)

  // All Routes Summary tab
  const [summaryDate, setSummaryDate] = useState(todayStr())
  const [summaryShift, setSummaryShift] = useState('morning')
  const [summaryData, setSummaryData] = useState([])
  const [summaryLoading, setSummaryLoading] = useState(false)

  // Edit Route state
  const [editingRouteId, setEditingRouteId] = useState(null)
  const [editRouteName, setEditRouteName] = useState('')
  const [editRouteCode, setEditRouteCode] = useState('')

  // Edit Society state
  const [editingSocietyId, setEditingSocietyId] = useState(null)
  const [editSocietyName, setEditSocietyName] = useState('')
  const [editSocietyCode, setEditSocietyCode] = useState('')

  // Fetch Master Data (Routes, Societies)
  const fetchMasterData = async () => {
    const { data: routeData } = await supabase.from('routes').select('*').order('name')
    setRoutes(routeData || [])
    
    const { data: socData } = await supabase.from('societies').select('*, routes(name)').order('code')
    setSocieties(socData || [])

    if (routeData && routeData.length > 0 && !selectedRouteId) {
      setSelectedRouteId(routeData[0].id)
    }
    setMasterDataVersion(v => v + 1)
  }

  // Load / Initialize Spreadsheet Grid
  const loadSpreadsheet = async () => {
    if (!selectedRouteId) return
    setLoading(true)

    // 1. Fetch societies on this route
    const { data: routeSocieties, error: socErr } = await supabase
      .from('societies')
      .select('*')
      .eq('route_id', selectedRouteId)
      .order('code')

    if (socErr) {
      toast.error(socErr.message)
      setLoading(false)
      return
    }

    // 2. Fetch existing dispatches for this route, date, and shift
    const { data: existingDispatches, error: dispErr } = await supabase
      .from('route_dispatches')
      .select('*')
      .eq('route_id', selectedRouteId)
      .eq('date', selectedDate)
      .eq('shift', selectedShift)

    if (dispErr) {
      toast.error(dispErr.message)
      setLoading(false)
      return
    }

    // 3. Build spreadsheet rows
    const rows = []
    
    routeSocieties.forEach(soc => {
      // Find any saved dispatches for this society
      const socDispatches = existingDispatches?.filter(d => d.society_id === soc.id) || []
      
      if (socDispatches.length > 0) {
        // Load existing dispatches
        socDispatches.forEach(d => {
          rows.push({
            id: d.id, // Keep original DB ID for updates
            society_id: soc.id,
            name: soc.name,
            code: soc.code,
            milk_type: d.milk_type,
            cans: d.cans.toString(),
            quantity: d.quantity.toString(),
            fat: d.fat.toString(),
            clr: d.clr.toString(),
            snf: d.snf.toFixed(2),
            kg_fat: d.kg_fat.toFixed(3),
            kg_snf: d.kg_snf.toFixed(3)
          })
        })
      } else {
        // Load default empty row for the society
        rows.push({
          id: null,
          society_id: soc.id,
          name: soc.name,
          code: soc.code,
          milk_type: 'b',
          cans: '',
          quantity: '',
          fat: '',
          clr: '',
          snf: '0.00',
          kg_fat: '0.000',
          kg_snf: '0.000'
        })
      }
    })

    setGridRows(rows)
    setLoading(false)
  }

  useEffect(() => {
    fetchMasterData()
  }, [])

  useEffect(() => {
    if (selectedRouteId) {
      loadSpreadsheet()
    }
  }, [selectedRouteId, selectedDate, selectedShift, masterDataVersion])

  // Live Formula Calculations per cell update
  const calculateRowValues = (qtyStr, fatStr, clrStr) => {
    const qty = parseFloat(qtyStr) || 0
    const fat = parseFloat(fatStr) || 0
    const clr = parseFloat(clrStr) || 0

    if (qty === 0 || fat === 0 || clr === 0) {
      return { snf: '0.00', kg_fat: '0.000', kg_snf: '0.000' }
    }

    // Formulas:
    // SNF = CLR / 4 + 0.21 * FAT + 0.66
    const snf = clr / 4 + 0.21 * fat + 0.66
    const kgFat = (qty * fat) / 100
    const kgSnf = (qty * snf) / 100

    return {
      snf: snf.toFixed(2),
      kg_fat: kgFat.toFixed(3),
      kg_snf: kgSnf.toFixed(3)
    }
  }

  // Handle cell edit change
  const handleCellChange = (index, field, value) => {
    setGridRows(prev => {
      const updated = [...prev]
      const row = { ...updated[index], [field]: value }

      // If cans changed, automatically calculate and prefill quantity as Cans * 40
      if (field === 'cans') {
        const cansVal = parseInt(value) || 0
        if (cansVal > 0) {
          row.quantity = (cansVal * 40).toString()
        } else {
          row.quantity = ''
        }
      }

      // If quantity changed, automatically calculate and prefill cans (1 Can = 40 Liters)
      if (field === 'quantity') {
        const qtyVal = parseFloat(value) || 0
        if (qtyVal > 0) {
          row.cans = Math.ceil(qtyVal / 40).toString()
        } else {
          row.cans = ''
        }
      }

      // Calculate derived columns based on quantity, fat, clr, or snf
      const qtyVal = parseFloat(row.quantity) || 0
      const fatVal = parseFloat(row.fat) || 0
      const clrVal = parseFloat(row.clr) || 0

      // Calculate kg_fat
      row.kg_fat = ((qtyVal * fatVal) / 100).toFixed(3)

      if (field === 'clr' || field === 'fat' || field === 'quantity') {
        // If we have a CLR, calculate SNF automatically
        if (clrVal > 0) {
          const calculatedSnf = clrVal / 4 + 0.21 * fatVal + 0.66
          row.snf = calculatedSnf.toFixed(2)
        }
      }

      // Always calculate kg_snf based on the current row.snf and quantity
      const currentSnf = parseFloat(row.snf) || 0
      row.kg_snf = ((qtyVal * currentSnf) / 100).toFixed(3)

      updated[index] = row
      return updated
    })
  }

  // Add duplicate entry row for multiple milk types from same society
  const handleAddDuplicateRow = (index) => {
    setGridRows(prev => {
      const target = prev[index]
      const newRow = {
        id: null,
        society_id: target.society_id,
        name: target.name,
        code: target.code,
        milk_type: target.milk_type === 'b' ? 'c' : 'b', // Default switch milk type
        cans: '',
        quantity: '',
        fat: '',
        clr: '',
        snf: '0.00',
        kg_fat: '0.000',
        kg_snf: '0.000'
      }
      const updated = [...prev]
      updated.splice(index + 1, 0, newRow) // Insert directly below the source row
      return updated
    })
  }

  // Remove duplicate/empty row from spreadsheet
  const handleRemoveRow = (index) => {
    setGridRows(prev => {
      const target = prev[index]
      // Count how many rows exist for this society
      const socRowsCount = prev.filter(r => r.society_id === target.society_id).length
      
      if (socRowsCount === 1) {
        // If it is the only row, just clear it instead of removing it, so the society stays in the sheet list
        const updated = [...prev]
        updated[index] = {
          ...target,
          id: null,
          milk_type: 'b',
          cans: '',
          quantity: '',
          fat: '',
          clr: '',
          snf: '0.00',
          kg_fat: '0.000',
          kg_snf: '0.000'
        }
        return updated
      } else {
        // If it is a duplicate row, remove it completely from the list
        return prev.filter((_, i) => i !== index)
      }
    })
  }

  // Save the entire Spreadsheet to Supabase
  const handleSaveSpreadsheet = async () => {
    setSaving(true)
    const toastId = toast.loading('Saving Dispatch Sheet...')

    try {
      // 1. Filter out only valid completed rows to insert
      const rowsToSave = gridRows.filter(row => {
        const qty = parseFloat(row.quantity) || 0
        const fat = parseFloat(row.fat) || 0
        const clr = parseFloat(row.clr) || 0
        const snf = parseFloat(row.snf) || 0
        return qty > 0 && fat > 0 && (clr > 0 || snf > 0)
      })

      // 2. Prepare payload
      const payload = rowsToSave.map(row => ({
        date: selectedDate,
        shift: selectedShift,
        route_id: selectedRouteId,
        society_id: row.society_id,
        milk_type: row.milk_type,
        cans: parseInt(row.cans) || 0,
        quantity: parseFloat(row.quantity),
        fat: parseFloat(row.fat),
        clr: parseFloat(row.clr),
        snf: parseFloat(row.snf),
        kg_fat: parseFloat(row.kg_fat),
        kg_snf: parseFloat(row.kg_snf)
      }))

      // 3. Clear existing dispatches for this date/shift/route to avoid duplicates
      const { error: deleteErr } = await supabase
        .from('route_dispatches')
        .delete()
        .eq('route_id', selectedRouteId)
        .eq('date', selectedDate)
        .eq('shift', selectedShift)

      if (deleteErr) throw deleteErr

      // 4. Batch insert new entries
      if (payload.length > 0) {
        const { error: insertErr } = await supabase
          .from('route_dispatches')
          .insert(payload)

        if (insertErr) throw insertErr
      }

      toast.success('Spreadsheet saved successfully!', { id: toastId })
      loadSpreadsheet() // Reload to get fresh DB states
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to save spreadsheet', { id: toastId })
    } finally {
      setSaving(false)
    }
  }

  // Settings: Add Route
  const handleAddRoute = async (e) => {
    e.preventDefault()
    if (!newRoute.name.trim() || !newRoute.code.trim()) return toast.error('All fields required')
    const { error } = await supabase.from('routes').insert({
      name: newRoute.name.trim(),
      code: newRoute.code.trim().toUpperCase()
    })
    if (error) toast.error(error.message)
    else {
      toast.success('Route added!')
      setNewRoute({ name: '', code: '' })
      fetchMasterData()
    }
  }

  // Settings: Delete Route
  const handleDeleteRoute = async () => {
    if (!deleteTargetRoute) return
    const { error } = await supabase.from('routes').delete().eq('id', deleteTargetRoute.id)
    if (error) toast.error(error.message)
    else {
      toast.success('Route deleted')
      if (selectedRouteId === deleteTargetRoute.id) {
        setSelectedRouteId('')
      }
      fetchMasterData()
    }
    setDeleteTargetRoute(null)
  }

  // Settings: Update Route
  const handleUpdateRoute = async (id) => {
    if (!editRouteName.trim() || !editRouteCode.trim()) {
      toast.error('Route Name and Code are required')
      return
    }
    const { error } = await supabase
      .from('routes')
      .update({
        name: editRouteName.trim(),
        code: editRouteCode.trim().toUpperCase()
      })
      .eq('id', id)

    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Route updated successfully')
      setEditingRouteId(null)
      fetchMasterData()
    }
  }

  // Settings: Add Society
  const handleAddSociety = async (e) => {
    e.preventDefault()
    if (!newSociety.route_id || !newSociety.code.trim() || !newSociety.name.trim()) return toast.error('All fields required')
    const { error } = await supabase.from('societies').insert({
      route_id: newSociety.route_id,
      code: newSociety.code.trim(),
      name: newSociety.name.trim()
    })
    if (error) toast.error(error.message)
    else {
      toast.success('Society added!')
      setNewSociety({ route_id: '', code: '', name: '' })
      fetchMasterData()
    }
  }

  // Settings: Delete Society
  const handleDeleteSociety = async () => {
    if (!deleteTargetSociety) return
    const { error } = await supabase.from('societies').delete().eq('id', deleteTargetSociety.id)
    if (error) toast.error(error.message)
    else {
      toast.success('Society deleted')
      fetchMasterData()
    }
    setDeleteTargetSociety(null)
  }

  // Settings: Update Society
  const handleUpdateSociety = async (id) => {
    if (!editSocietyCode.trim()) {
      toast.error('Society Code is required')
      return
    }
    const { error } = await supabase
      .from('societies')
      .update({
        name: editSocietyName.trim(),
        code: editSocietyCode.trim()
      })
      .eq('id', id)

    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Society updated successfully')
      setEditingSocietyId(null)
      fetchMasterData()
    }
  }

  // Fetch All Routes Summary
  const fetchAllRoutesSummary = async () => {
    setSummaryLoading(true)
    const { data, error } = await supabase
      .from('route_dispatches')
      .select('*, routes(name, code)')
      .eq('date', summaryDate)
      .eq('shift', summaryShift)

    if (error) {
      toast.error(error.message)
      setSummaryLoading(false)
      return
    }

    // Group by route
    const byRoute = {}
    ;(data || []).forEach(row => {
      const routeId = row.route_id
      if (!byRoute[routeId]) {
        byRoute[routeId] = {
          routeName: row.routes?.name || 'Unknown',
          routeCode: row.routes?.code || '-',
          cans: 0, qty: 0,
          kgFat: 0, kgSnf: 0,
          weightedFat: 0, weightedClr: 0, weightedSnf: 0
        }
      }
      const r = byRoute[routeId]
      const qty = parseFloat(row.quantity) || 0
      r.cans    += parseInt(row.cans) || 0
      r.qty     += qty
      r.kgFat   += parseFloat(row.kg_fat) || 0
      r.kgSnf   += parseFloat(row.kg_snf) || 0
      r.weightedFat += qty * (parseFloat(row.fat) || 0)
      r.weightedClr += qty * (parseFloat(row.clr) || 0)
      r.weightedSnf += qty * (parseFloat(row.snf) || 0)
    })

    const result = Object.values(byRoute).map(r => ({
      ...r,
      avgFat: r.qty > 0 ? r.weightedFat / r.qty : 0,
      avgClr: r.qty > 0 ? r.weightedClr / r.qty : 0,
      avgSnf: r.qty > 0 ? r.weightedSnf / r.qty : 0,
    }))

    setSummaryData(result)
    setSummaryLoading(false)
  }

  // Auto-fetch summary when date/shift changes while on summary tab
  useEffect(() => {
    if (activeTab === 'summary') fetchAllRoutesSummary()
  }, [summaryDate, summaryShift, activeTab])

  // Sheet calculations totals
  const totalCans = gridRows.reduce((sum, r) => sum + (parseInt(r.cans) || 0), 0)
  const totalQty = gridRows.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0), 0)
  const totalKgFat = gridRows.reduce((sum, r) => sum + (parseFloat(r.kg_fat) || 0), 0)
  const totalKgSnf = gridRows.reduce((sum, r) => sum + (parseFloat(r.kg_snf) || 0), 0)

  // Weighted averages
  const avgFat = totalQty > 0 ? (gridRows.reduce((sum, r) => sum + ((parseFloat(r.quantity) || 0) * (parseFloat(r.fat) || 0)), 0) / totalQty) : 0
  const avgClr = totalQty > 0 ? (gridRows.reduce((sum, r) => sum + ((parseFloat(r.quantity) || 0) * (parseFloat(r.clr) || 0)), 0) / totalQty) : 0
  const avgSnf = totalQty > 0 ? (gridRows.reduce((sum, r) => sum + ((parseFloat(r.quantity) || 0) * (parseFloat(r.snf) || 0)), 0) / totalQty) : 0

  return (
    <div>
      {/* Header */}
      <div className="page-header no-print">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Truck size={28} style={{ color: '#0F6E56' }} /> Route Dispatch Grid
          </h1>
          <p className="page-subtitle">Excel-like spreadsheet for direct data entry and automatic formulas</p>
        </div>
        
        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className={`btn-${activeTab === 'entry' ? 'primary' : 'secondary'}`} 
            onClick={() => setActiveTab('entry')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <FileSpreadsheet size={16} /> Excel Sheet View
          </button>
          <button 
            className={`btn-${activeTab === 'summary' ? 'primary' : 'secondary'}`} 
            onClick={() => setActiveTab('summary')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Truck size={16} /> All Routes Summary
          </button>
          <button 
            className={`btn-${activeTab === 'settings' ? 'primary' : 'secondary'}`} 
            onClick={() => setActiveTab('settings')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Settings size={16} /> Setup Settings
          </button>
        </div>
      </div>

      {activeTab === 'entry' && (
        <div>
          {/* Controls Panel */}
          <div className="filters-row no-print" style={{ background: 'white', padding: '1rem', borderRadius: 12, border: '1px solid #E5E9EE', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B' }}>Route</label>
                <select className="input" style={{ width: 180 }} value={selectedRouteId} onChange={e => setSelectedRouteId(e.target.value)}>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B' }}>Date</label>
                <input type="date" className="input" style={{ width: 150 }} value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B' }}>Shift</label>
                <select className="input" style={{ width: 130 }} value={selectedShift} onChange={e => setSelectedShift(e.target.value)}>
                  <option value="morning">Morning</option>
                  <option value="evening">Evening</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-secondary" onClick={() => window.print()}>
                <Printer size={16} /> Print Sheet
              </button>
              <button className="btn-primary" onClick={handleSaveSpreadsheet} disabled={saving || loading || gridRows.length === 0} style={{ gap: '0.5rem' }}>
                <Save size={16} /> {saving ? 'Saving...' : 'Save Spreadsheet'}
              </button>
            </div>
          </div>

          {/* Interactive Excel Sheet Grid */}
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : (
            <div className="card" style={{ padding: 0, border: '1px solid #CBD5E1', borderRadius: '8px', overflow: 'hidden', background: '#F8FAFC' }}>
              {/* Header for print report */}
              <div className="print-only" style={{ textAlign: 'center', margin: '1.5rem 0', borderBottom: '2px solid #0F6E56', paddingBottom: '1rem' }}>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1A2332', margin: '0 0 0.25rem 0' }}>Vitta Sahawa Dairy</h1>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#475569', margin: '0 0 0.25rem 0' }}>Route Society Milk dispatch report</h2>
                <p style={{ fontSize: '1.0rem', fontWeight: 700, color: '#64748B', margin: '0' }}>
                  Route: {routes.find(r => r.id === selectedRouteId)?.name || 'N/A'} | Date: {formatDate(selectedDate)} | Shift: {selectedShift.toUpperCase()}
                </p>
              </div>

              <div className="table-container" style={{ overflowX: 'auto' }}>
                <table className="excel-grid-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: '#E2E8F0', color: '#1E293B', fontWeight: 'bold' }}>
                      <th style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'center', width: '50px' }}>SR NO</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'left', minWidth: '150px' }}>Soci</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'center', width: '80px' }}>Code</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'center', width: '80px' }}>Milk Ty</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right', width: '80px' }}>Can</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right', width: '100px' }}>11 / Qty</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right', width: '80px' }}>Fat</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right', width: '80px' }}>CLR</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right', width: '90px' }}>Snf</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right', width: '110px' }}>Kg Fat</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right', width: '110px' }}>Kg Snf</th>
                      <th style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'center', width: '90px' }} className="no-print">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gridRows.length === 0 ? (
                      <tr>
                        <td colSpan={12} style={{ padding: '2.5rem', textAlign: 'center', color: '#64748B' }}>
                          No societies configured for this route yet. Please go to Setup tab.
                        </td>
                      </tr>
                    ) : (
                      gridRows.map((row, index) => (
                        <tr key={index} style={{ background: 'white' }}>
                          {/* SR NO */}
                          <td style={{ padding: 0, border: '1px solid #CBD5E1', textAlign: 'center', fontWeight: '600', background: '#F1F5F9' }}>
                            {index + 1}
                          </td>

                          {/* Society Name (Read-Only) */}
                          <td style={{ padding: '0.5rem', border: '1px solid #CBD5E1', fontWeight: '600', color: '#1E293B' }}>
                            {row.name}
                          </td>

                          {/* Society Code (Read-Only) */}
                          <td style={{ padding: '0.5rem', border: '1px solid #CBD5E1', textAlign: 'center', color: '#475569' }}>
                            {row.code}
                          </td>

                          {/* Milk Type (Editable) */}
                          <td style={{ padding: 0, border: '1px solid #CBD5E1', textAlign: 'center' }}>
                            <select 
                              className="grid-input"
                              style={{ textAlignLast: 'center', cursor: 'pointer', padding: '0.4rem' }}
                              value={row.milk_type}
                              onChange={e => handleCellChange(index, 'milk_type', e.target.value)}
                            >
                              {MILK_TYPES.map(mt => (
                                <option key={mt.value} value={mt.value}>{mt.label}</option>
                              ))}
                            </select>
                          </td>

                          {/* Cans (Editable) */}
                          <td style={{ padding: 0, border: '1px solid #CBD5E1' }}>
                            <input 
                              type="number"
                              className="grid-input text-right"
                              placeholder="0"
                              value={row.cans}
                              onChange={e => handleCellChange(index, 'cans', e.target.value)}
                            />
                          </td>

                          {/* Quantity (Editable) */}
                          <td style={{ padding: 0, border: '1px solid #CBD5E1' }}>
                            <input 
                              type="number"
                              step="0.1"
                              className="grid-input text-right font-bold"
                              placeholder="0.0"
                              value={row.quantity}
                              onChange={e => handleCellChange(index, 'quantity', e.target.value)}
                            />
                          </td>

                          {/* Fat (Editable) */}
                          <td style={{ padding: 0, border: '1px solid #CBD5E1' }}>
                            <input 
                              type="number"
                              step="0.1"
                              className="grid-input text-right"
                              placeholder="0.0"
                              value={row.fat}
                              onChange={e => handleCellChange(index, 'fat', e.target.value)}
                            />
                          </td>

                          {/* CLR (Editable) */}
                          <td style={{ padding: 0, border: '1px solid #CBD5E1' }}>
                            <input 
                              type="number"
                              step="0.1"
                              className="grid-input text-right"
                              placeholder="0.0"
                              value={row.clr}
                              onChange={e => handleCellChange(index, 'clr', e.target.value)}
                            />
                          </td>

                          {/* SNF (Editable) */}
                          <td style={{ padding: 0, border: '1px solid #CBD5E1' }}>
                            <input 
                              type="number"
                              step="0.01"
                              className="grid-input text-right font-semibold"
                              placeholder="0.00"
                              value={row.snf}
                              onChange={e => handleCellChange(index, 'snf', e.target.value)}
                            />
                          </td>

                          {/* Kg Fat (Calculated, Read-Only) */}
                          <td style={{ padding: '0.5rem', border: '1px solid #CBD5E1', textAlign: 'right', fontWeight: '700', color: '#0F6E56', background: '#F8FAFC' }}>
                            {row.kg_fat}
                          </td>

                          {/* Kg SNF (Calculated, Read-Only) */}
                          <td style={{ padding: '0.5rem', border: '1px solid #CBD5E1', textAlign: 'right', fontWeight: '700', color: '#0F6E56', background: '#F8FAFC' }}>
                            {row.kg_snf}
                          </td>

                          {/* Row Actions */}
                          <td style={{ padding: '0.25rem', border: '1px solid #CBD5E1', textAlign: 'center' }} className="no-print">
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.25rem' }}>
                              <button 
                                className="btn-ghost btn-sm" 
                                style={{ padding: '4px', color: '#0F6E56' }}
                                title="Duplicate row for extra Milk Type"
                                onClick={() => handleAddDuplicateRow(index)}
                              >
                                <Plus size={14} />
                              </button>
                              <button 
                                className="btn-ghost btn-sm" 
                                style={{ padding: '4px', color: '#DC2626' }}
                                title="Clear / Remove row"
                                onClick={() => handleRemoveRow(index)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {gridRows.length > 0 && (
                    <tfoot>
                      <tr style={{ background: '#E2E8F0', fontWeight: 'bold', borderTop: '2px solid #94A3B8' }}>
                        <td colSpan={4} style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'center' }}>Total Summary</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right' }}>{totalCans}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right' }}>{totalQty.toFixed(1)}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right' }}>{avgFat.toFixed(2)}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right' }}>{avgClr.toFixed(1)}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right' }}>{avgSnf.toFixed(2)}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right', color: '#0F6E56' }}>{totalKgFat.toFixed(3)}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #94A3B8', textAlign: 'right', color: '#0F6E56' }}>{totalKgSnf.toFixed(3)}</td>
                        <td style={{ padding: '0.6rem', border: '1px solid #94A3B8' }} className="no-print"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'summary' && (
        <div>
          {/* Controls */}
          <div className="filters-row no-print" style={{ background: 'white', padding: '1rem', borderRadius: 12, border: '1px solid #E5E9EE', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B' }}>Date</label>
                <input type="date" className="input" style={{ width: 150 }} value={summaryDate} onChange={e => setSummaryDate(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B' }}>Shift</label>
                <select className="input" style={{ width: 130 }} value={summaryShift} onChange={e => setSummaryShift(e.target.value)}>
                  <option value="morning">Morning</option>
                  <option value="evening">Evening</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-secondary" onClick={() => window.print()}>
                <Printer size={16} /> Print
              </button>
              <button className="btn-primary" onClick={fetchAllRoutesSummary} disabled={summaryLoading}>
                {summaryLoading ? 'Loading...' : '↻ Refresh'}
              </button>
            </div>
          </div>

          {/* Print Header */}
          <div className="print-only" style={{ textAlign: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #0F6E56', paddingBottom: '1rem' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1A2332', margin: '0 0 0.25rem 0' }}>Vitta Sahawa Dairy</h1>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#475569', margin: '0 0 0.25rem 0' }}>All Routes Milk Dispatch Summary</h2>
            <p style={{ fontSize: '1.0rem', fontWeight: 700, color: '#64748B', margin: 0 }}>Date: {formatDate(summaryDate)} | Shift: {summaryShift.toUpperCase()}</p>
          </div>

          {summaryLoading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : summaryData.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#64748B' }}>
              No dispatch data found for the selected date and shift.
            </div>
          ) : (() => {
            const grandCans   = summaryData.reduce((s, r) => s + r.cans, 0)
            const grandQty    = summaryData.reduce((s, r) => s + r.qty, 0)
            const grandKgFat  = summaryData.reduce((s, r) => s + r.kgFat, 0)
            const grandKgSnf  = summaryData.reduce((s, r) => s + r.kgSnf, 0)
            const grandWFat   = summaryData.reduce((s, r) => s + r.weightedFat, 0)
            const grandWClr   = summaryData.reduce((s, r) => s + r.weightedClr, 0)
            const grandWSnf   = summaryData.reduce((s, r) => s + r.weightedSnf, 0)
            const grandAvgFat = grandQty > 0 ? grandWFat / grandQty : 0
            const grandAvgClr = grandQty > 0 ? grandWClr / grandQty : 0
            const grandAvgSnf = grandQty > 0 ? grandWSnf / grandQty : 0
            return (
              <div className="card" style={{ padding: 0, border: '1px solid #CBD5E1', borderRadius: 8, overflow: 'hidden' }}>
                <div className="table-container" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: '#0F6E56', color: 'white', fontWeight: 700 }}>
                        <th style={{ padding: '0.75rem 1rem', border: '1px solid #0A5240', textAlign: 'left' }}>Route</th>
                        <th style={{ padding: '0.75rem 1rem', border: '1px solid #0A5240', textAlign: 'center' }}>Code</th>
                        <th style={{ padding: '0.75rem 1rem', border: '1px solid #0A5240', textAlign: 'right' }}>Cans</th>
                        <th style={{ padding: '0.75rem 1rem', border: '1px solid #0A5240', textAlign: 'right' }}>Qty (L)</th>
                        <th style={{ padding: '0.75rem 1rem', border: '1px solid #0A5240', textAlign: 'right' }}>Avg FAT</th>
                        <th style={{ padding: '0.75rem 1rem', border: '1px solid #0A5240', textAlign: 'right' }}>Avg CLR</th>
                        <th style={{ padding: '0.75rem 1rem', border: '1px solid #0A5240', textAlign: 'right' }}>Avg SNF</th>
                        <th style={{ padding: '0.75rem 1rem', border: '1px solid #0A5240', textAlign: 'right' }}>Kg FAT</th>
                        <th style={{ padding: '0.75rem 1rem', border: '1px solid #0A5240', textAlign: 'right' }}>Kg SNF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryData.map((r, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC' }}>
                          <td style={{ padding: '0.65rem 1rem', border: '1px solid #E2E8F0', fontWeight: 700, color: '#1E293B' }}>{r.routeName}</td>
                          <td style={{ padding: '0.65rem 1rem', border: '1px solid #E2E8F0', textAlign: 'center', color: '#475569' }}>{r.routeCode}</td>
                          <td style={{ padding: '0.65rem 1rem', border: '1px solid #E2E8F0', textAlign: 'right' }}>{r.cans}</td>
                          <td style={{ padding: '0.65rem 1rem', border: '1px solid #E2E8F0', textAlign: 'right', fontWeight: 700 }}>{r.qty.toFixed(1)}</td>
                          <td style={{ padding: '0.65rem 1rem', border: '1px solid #E2E8F0', textAlign: 'right' }}>{r.avgFat.toFixed(2)}</td>
                          <td style={{ padding: '0.65rem 1rem', border: '1px solid #E2E8F0', textAlign: 'right' }}>{r.avgClr.toFixed(1)}</td>
                          <td style={{ padding: '0.65rem 1rem', border: '1px solid #E2E8F0', textAlign: 'right' }}>{r.avgSnf.toFixed(2)}</td>
                          <td style={{ padding: '0.65rem 1rem', border: '1px solid #E2E8F0', textAlign: 'right', fontWeight: 700, color: '#0F6E56' }}>{r.kgFat.toFixed(3)}</td>
                          <td style={{ padding: '0.65rem 1rem', border: '1px solid #E2E8F0', textAlign: 'right', fontWeight: 700, color: '#0F6E56' }}>{r.kgSnf.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#1E293B', color: 'white', fontWeight: 800, borderTop: '3px solid #0F6E56' }}>
                        <td colSpan={2} style={{ padding: '0.75rem 1rem', border: '1px solid #374151', textAlign: 'center', letterSpacing: '0.05em' }}>🏁 GRAND TOTAL</td>
                        <td style={{ padding: '0.75rem 1rem', border: '1px solid #374151', textAlign: 'right' }}>{grandCans}</td>
                        <td style={{ padding: '0.75rem 1rem', border: '1px solid #374151', textAlign: 'right' }}>{grandQty.toFixed(1)}</td>
                        <td style={{ padding: '0.75rem 1rem', border: '1px solid #374151', textAlign: 'right' }}>{grandAvgFat.toFixed(2)}</td>
                        <td style={{ padding: '0.75rem 1rem', border: '1px solid #374151', textAlign: 'right' }}>{grandAvgClr.toFixed(1)}</td>
                        <td style={{ padding: '0.75rem 1rem', border: '1px solid #374151', textAlign: 'right' }}>{grandAvgSnf.toFixed(2)}</td>
                        <td style={{ padding: '0.75rem 1rem', border: '1px solid #374151', textAlign: 'right', color: '#34D399' }}>{grandKgFat.toFixed(3)}</td>
                        <td style={{ padding: '0.75rem 1rem', border: '1px solid #374151', textAlign: 'right', color: '#34D399' }}>{grandKgSnf.toFixed(3)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {activeTab === 'settings' && (

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* Route Setup */}
          <div className="card">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1E293B', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.5rem' }}>
              Route Master
            </h2>

            <form onSubmit={handleAddRoute} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'end' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Route Name *</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="e.g. Route 53" 
                  value={newRoute.name} 
                  onChange={e => setNewRoute(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div style={{ width: '100px' }}>
                <label className="form-label">Code *</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="R53" 
                  value={newRoute.code} 
                  onChange={e => setNewRoute(p => ({ ...p, code: e.target.value }))}
                />
              </div>
              <button type="submit" className="btn-primary" style={{ height: '38px' }}>Add Route</button>
            </form>

            <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Route Name</th>
                    <th>Route Code</th>
                    <th style={{ width: '90px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {routes.length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', color: '#64748B' }}>No routes configured.</td></tr>
                  ) : (
                    routes.map(r => {
                      const isEditing = editingRouteId === r.id
                      return (
                        <tr key={r.id}>
                          <td>
                            {isEditing ? (
                              <input 
                                type="text" 
                                className="input" 
                                style={{ height: '32px', fontSize: '0.85rem', padding: '4px 8px' }} 
                                value={editRouteName} 
                                onChange={e => setEditRouteName(e.target.value)} 
                              />
                            ) : (
                              <strong>{r.name}</strong>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input 
                                type="text" 
                                className="input" 
                                style={{ height: '32px', fontSize: '0.85rem', padding: '4px 8px', width: '80px' }} 
                                value={editRouteCode} 
                                onChange={e => setEditRouteCode(e.target.value)} 
                              />
                            ) : (
                              r.code
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'end' }}>
                                <button 
                                  className="btn-primary btn-sm" 
                                  style={{ padding: '4px', background: '#0F6E56' }} 
                                  onClick={() => handleUpdateRoute(r.id)}
                                  title="Save changes"
                                >
                                  <Check size={14} />
                                </button>
                                <button 
                                  className="btn-secondary btn-sm" 
                                  style={{ padding: '4px' }} 
                                  onClick={() => setEditingRouteId(null)}
                                  title="Cancel"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'end' }}>
                                <button 
                                  className="btn-ghost btn-sm" 
                                  style={{ color: '#0F6E56', padding: '4px' }} 
                                  onClick={() => {
                                    setEditingRouteId(r.id)
                                    setEditRouteName(r.name)
                                    setEditRouteCode(r.code)
                                  }}
                                  title="Edit Route"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button 
                                  className="btn-ghost btn-sm" 
                                  style={{ color: '#DC2626', padding: '4px' }} 
                                  onClick={() => setDeleteTargetRoute(r)}
                                  title="Delete Route"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Society Setup */}
          <div className="card">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1E293B', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.5rem' }}>
              Society Master
            </h2>

            <form onSubmit={handleAddSociety} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div>
                <label className="form-label">Route *</label>
                <select 
                  className="input" 
                  value={newSociety.route_id} 
                  onChange={e => setNewSociety(p => ({ ...p, route_id: e.target.value }))}
                >
                  <option value="">Select Route</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Society Code *</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="e.g. 1235" 
                  value={newSociety.code} 
                  onChange={e => setNewSociety(p => ({ ...p, code: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: '1/span 2', display: 'flex', gap: '0.75rem', alignItems: 'end' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Society Name *</label>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="e.g. Ad C" 
                    value={newSociety.name} 
                    onChange={e => setNewSociety(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ height: '38px', minWidth: '110px' }}>Add Society</button>
              </div>
            </form>

            <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Society Name</th>
                    <th>Route</th>
                    <th style={{ width: '90px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {societies.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: '#64748B' }}>No societies configured.</td></tr>
                  ) : (
                    societies.map(s => {
                      const isEditingSoc = editingSocietyId === s.id
                      return (
                        <tr key={s.id}>
                          <td>
                            {isEditingSoc ? (
                              <input
                                type="text"
                                className="input"
                                style={{ height: '32px', fontSize: '0.85rem', padding: '4px 8px', width: '90px' }}
                                value={editSocietyCode}
                                onChange={e => setEditSocietyCode(e.target.value)}
                              />
                            ) : (
                              <strong>{s.code}</strong>
                            )}
                          </td>
                          <td>
                            {isEditingSoc ? (
                              <input
                                type="text"
                                className="input"
                                style={{ height: '32px', fontSize: '0.85rem', padding: '4px 8px' }}
                                value={editSocietyName}
                                onChange={e => setEditSocietyName(e.target.value)}
                                placeholder="Society name (optional)"
                              />
                            ) : (
                              <strong>{s.name || <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>—</span>}</strong>
                            )}
                          </td>
                          <td>{s.routes?.name || 'N/A'}</td>
                          <td style={{ textAlign: 'right' }}>
                            {isEditingSoc ? (
                              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'end' }}>
                                <button
                                  className="btn-primary btn-sm"
                                  style={{ padding: '4px', background: '#0F6E56' }}
                                  onClick={() => handleUpdateSociety(s.id)}
                                  title="Save changes"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  className="btn-secondary btn-sm"
                                  style={{ padding: '4px' }}
                                  onClick={() => setEditingSocietyId(null)}
                                  title="Cancel"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'end' }}>
                                <button
                                  className="btn-ghost btn-sm"
                                  style={{ color: '#0F6E56', padding: '4px' }}
                                  onClick={() => {
                                    setEditingSocietyId(s.id)
                                    setEditSocietyName(s.name || '')
                                    setEditSocietyCode(s.code)
                                  }}
                                  title="Edit Society"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  className="btn-ghost btn-sm"
                                  style={{ color: '#DC2626', padding: '4px' }}
                                  onClick={() => setDeleteTargetSociety(s)}
                                  title="Delete Society"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Settings Confirm Dialogs */}
      {deleteTargetRoute && (
        <ConfirmDialog 
          title="Delete Route"
          message={`Delete Route "${deleteTargetRoute.name}"? This will delete all societies and dispatch entries associated with it.`}
          onConfirm={handleDeleteRoute} 
          onCancel={() => setDeleteTargetRoute(null)} 
          confirmLabel="Delete" 
        />
      )}

      {deleteTargetSociety && (
        <ConfirmDialog 
          title="Delete Society"
          message={`Delete Society "${deleteTargetSociety.name}"? This will delete all dispatch entries associated with it.`}
          onConfirm={handleDeleteSociety} 
          onCancel={() => setDeleteTargetSociety(null)} 
          confirmLabel="Delete" 
        />
      )}
    </div>
  )
}

// Inline CSS for the Spreadsheet grid cells
const style = document.createElement('style')
style.innerHTML = `
  .grid-input {
    width: 100%;
    height: 100%;
    border: none;
    padding: 0.5rem 0.6rem;
    font-size: 0.875rem;
    font-family: inherit;
    color: inherit;
    background: transparent;
    outline: none;
    transition: background 0.15s ease;
  }
  .grid-input:focus {
    background: #DCFCE7;
    outline: 2px solid #16A34A;
  }
  .grid-input.text-right {
    text-align: right;
  }
  .excel-grid-table th {
    font-weight: 700;
  }
  .excel-grid-table td {
    position: relative;
    padding: 0;
  }
  @media print {
    .grid-input {
      border: none !important;
      background: transparent !important;
      outline: none !important;
    }
    .grid-input::-webkit-outer-spin-button,
    .grid-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  }
`
document.head.appendChild(style)
