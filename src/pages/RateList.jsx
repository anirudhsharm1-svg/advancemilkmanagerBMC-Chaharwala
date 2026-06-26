import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { calculateMilkRate, fetchAndCacheCustomRates, setCustomRatesCache, getCustomRatesCache } from '../utils/rateCalculator'
import toast from 'react-hot-toast'
import { Printer, TableProperties, Save, RefreshCw } from 'lucide-react'

// SNF columns: 9.2 → 8.2
const SNF_COLS = [92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82]

// FAT rows
const COW_FAT_ROWS  = Array.from({ length: 16 }, (_, i) => +(3.5 + i * 0.1).toFixed(1))
const BUFF_FAT_ROWS = Array.from({ length: 50 }, (_, i) => +(5.1 + i * 0.1).toFixed(1))

const COW_HIGHLIGHT  = 4.3
const BUFF_HIGHLIGHT = 5.5

const TAB_BTN = (active) => ({
  background: 'none', border: 'none', padding: '0.65rem 1.2rem',
  cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem',
  borderBottom: active ? '3px solid #0F6E56' : '3px solid transparent',
  color: active ? '#0F6E56' : '#64748B', marginBottom: '-2px', transition: 'all 0.2s'
})

// Build initial grid from custom cache or default slabs
function buildGrid(fatRows, milkType, slabs, customRates) {
  return fatRows.map(fat =>
    SNF_COLS.map(snf => {
      // 1. Try custom rates first
      if (customRates && customRates[milkType]) {
        const key = `${fat.toFixed(1)}_${snf}`
        const customRate = customRates[milkType][key]
        if (customRate !== undefined && customRate !== null && customRate !== '') {
          return parseFloat(customRate).toFixed(2)
        }
      }
      // 2. Fallback to standard formula
      const r = calculateMilkRate(fat, snf, 1, slabs, milkType)
      return r.found ? r.rate.toFixed(2) : ''
    })
  )
}

export default function RateList() {
  const [slabs, setSlabs]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [tab, setTab]               = useState('cow')    // 'cow' | 'buffalo'
  const [cowGrid, setCowGrid]       = useState([])       // [fatRow][snfCol]
  const [buffGrid, setBuffGrid]     = useState([])
  const [dirtySet, setDirtySet]     = useState(new Set()) // "fat_snf_type" keys
  const [editCell, setEditCell]     = useState(null)     // {ri, ci}

  const fetchRates = async () => {
    setLoading(true)
    // 1. Fetch DB fallback slabs
    const { data: slabsData } = await supabase.from('snf_slabs').select('*')
    const s = slabsData || []
    setSlabs(s)

    // 2. Fetch custom rates from database
    const customRates = await fetchAndCacheCustomRates()

    // 3. Build grids
    setCowGrid(buildGrid(COW_FAT_ROWS,  'cow',     s, customRates))
    setBuffGrid(buildGrid(BUFF_FAT_ROWS, 'buffalo', s, customRates))
    
    setDirtySet(new Set())
    setLoading(false)
  }

  useEffect(() => { fetchRates() }, [])

  const handleLoadPrintoutRates = () => {
    const confirm = window.confirm('Are you sure you want to load the rates matching the printed chart (11.04.2026)? This will overwrite your unsaved edits. You must click "Save Changes" afterwards to commit them to the database.')
    if (!confirm) return

    const cowSlabs = [
      { snf: 92, base: 32.55 }, { snf: 91, base: 32.45 }, { snf: 90, base: 32.35 },
      { snf: 89, base: 32.25 }, { snf: 88, base: 32.15 }, { snf: 87, base: 31.92 },
      { snf: 86, base: 31.69 }, { snf: 85, base: 31.46 }, { snf: 84, base: 31.02 },
      { snf: 83, base: 30.58 }, { snf: 82, base: 30.14 }
    ]

    const buffaloSlabs = [
      { snf: 92, base: 39.78 }, { snf: 91, base: 39.53 }, { snf: 90, base: 39.28 },
      { snf: 89, base: 39.03 }, { snf: 88, base: 38.78 }, { snf: 87, base: 38.28 },
      { snf: 86, base: 37.78 }, { snf: 85, base: 37.28 }, { snf: 84, base: 36.28 },
      { snf: 83, base: 35.78 }, { snf: 82, base: 35.28 }
    ]

    // 1. Generate Cow Grid
    const newCowGrid = COW_FAT_ROWS.map(fat =>
      SNF_COLS.map(snf => {
        const slab = cowSlabs.find(s => s.snf === snf)
        if (!slab) return ''
        const increments = Math.round((fat - 3.5) / 0.1)
        const rate = slab.base + increments * 0.34
        return rate.toFixed(2)
      })
    )

    // 2. Generate Buffalo Grid
    const newBuffGrid = BUFF_FAT_ROWS.map(fat =>
      SNF_COLS.map(snf => {
        const slab = buffaloSlabs.find(s => s.snf === snf)
        if (!slab) return ''
        const increments = Math.round((fat - 5.1) / 0.1)
        let rate = slab.base + increments * 0.78
        if (fat >= 6.0 && snf >= 84) {
          rate += 1.00
        }
        return rate.toFixed(2)
      })
    )

    setCowGrid(newCowGrid)
    setBuffGrid(newBuffGrid)

    // 3. Mark all cells as dirty
    const newDirty = new Set()
    COW_FAT_ROWS.forEach(fat => {
      SNF_COLS.forEach(snf => {
        newDirty.add(`${fat}_${snf}_cow`)
      })
    })
    BUFF_FAT_ROWS.forEach(fat => {
      SNF_COLS.forEach(snf => {
        newDirty.add(`${fat}_${snf}_buffalo`)
      })
    })
    setDirtySet(newDirty)
    toast.success('Printout chart rates loaded! Review and click "Save Changes" to save.')
  }

  const isCow = tab === 'cow'
  const grid    = isCow ? cowGrid    : buffGrid
  const setGrid = isCow ? setCowGrid : setBuffGrid
  const fatRows = isCow ? COW_FAT_ROWS : BUFF_FAT_ROWS
  const highlight = isCow ? COW_HIGHLIGHT : BUFF_HIGHLIGHT

  // Cell change handler
  const handleChange = (ri, ci, val) => {
    setGrid(prev => {
      const next = prev.map(r => [...r])
      next[ri][ci] = val
      return next
    })
    const key = `${fatRows[ri]}_${SNF_COLS[ci]}_${tab}`
    setDirtySet(prev => new Set(prev).add(key))
  }

  // Save all custom rates to DB
  const handleSave = async () => {
    if (dirtySet.size === 0) { toast('No changes to save.'); return }
    setSaving(true)
    const tid = toast.loading('Saving rates...')
    try {
      // 1. Prepare entire custom rates JSON structure
      const updatedRates = {
        cow: { ...(getCustomRatesCache()?.cow || {}) },
        buffalo: { ...(getCustomRatesCache()?.buffalo || {}) }
      }

      // Merge Cow Grid
      COW_FAT_ROWS.forEach((fat, ri) => {
        SNF_COLS.forEach((snf, ci) => {
          const val = cowGrid[ri]?.[ci]
          if (val !== undefined && val !== '') {
            updatedRates.cow[`${fat.toFixed(1)}_${snf}`] = parseFloat(val)
          }
        })
      })

      // Merge Buffalo Grid
      BUFF_FAT_ROWS.forEach((fat, ri) => {
        SNF_COLS.forEach((snf, ci) => {
          const val = buffGrid[ri]?.[ci]
          if (val !== undefined && val !== '') {
            updatedRates.buffalo[`${fat.toFixed(1)}_${snf}`] = parseFloat(val)
          }
        })
      })

      // 2. Save under special system farmer
      const { error } = await supabase
        .from('farmers')
        .upsert({
          code: 'SYSTEM_RATES',
          name: 'System Rates Config',
          phone: '0000000000',
          address: JSON.stringify(updatedRates)
        }, { onConflict: 'phone' })

      if (error) throw error

      // 3. Update memory cache and state
      setCustomRatesCache(updatedRates)
      setDirtySet(new Set())
      toast.success('Rates saved successfully!', { id: tid })
    } catch (err) {
      toast.error('Save failed: ' + err.message, { id: tid })
    } finally {
      setSaving(false)
    }
  }

  const hasDirty = dirtySet.size > 0

  // ── Styles ─────────────────────────────────────────────────
  const thStyle = {
    padding: '5px 7px', border: '1px solid #94A3B8', textAlign: 'center',
    fontSize: '0.72rem', fontWeight: 700, background: '#1E3A2F', color: 'white',
    whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 2,
  }
  const fatThStyle = {
    ...thStyle, background: '#0F6E56', left: 0, zIndex: 3, minWidth: 64,
  }
  const fatCellStyle = (fat) => ({
    padding: '2px 8px', border: '1px solid #CBD5E1', textAlign: 'center',
    fontSize: '0.72rem', fontWeight: fat === highlight ? 700 : 600,
    color: fat === highlight ? '#B91C1C' : '#334155',
    background: fat === highlight ? '#FEF2F2' : '#F1F5F9',
    whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1,
  })

  const cellBg = (fat, isDirty) => {
    if (isDirty)         return '#FFFBEB'
    if (fat === highlight) return '#FEF2F2'
    return 'white'
  }

  const RateSheet = () => (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', border: '1px solid #94A3B8', borderRadius: 8 }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '0.72rem', tableLayout: 'fixed', width: 'max-content' }}>
        <thead>
          <tr>
            <th style={fatThStyle}>Fat &amp; SNF</th>
            {SNF_COLS.map(s => (
              <th key={s} style={{ ...thStyle, width: 76 }}>{(s / 10).toFixed(1)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fatRows.map((fat, ri) => (
            <tr key={fat}>
              <td style={fatCellStyle(fat)}>{fat.toFixed(1)}</td>
              {SNF_COLS.map((snf, ci) => {
                const isDirty  = dirtySet.has(`${fat}_${snf}_${tab}`)
                const isEditing = editCell?.ri === ri && editCell?.ci === ci
                const val = grid[ri]?.[ci] ?? ''
                return (
                  <td
                    key={snf}
                    style={{
                      padding: 0, border: '1px solid #CBD5E1',
                      background: cellBg(fat, isDirty),
                      outline: isEditing ? '2px solid #0F6E56' : 'none',
                      outlineOffset: -2,
                    }}
                    onClick={() => setEditCell({ ri, ci })}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        type="number"
                        step="0.01"
                        value={val}
                        onChange={e => handleChange(ri, ci, e.target.value)}
                        onBlur={() => setEditCell(null)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === 'Tab') {
                            e.preventDefault()
                            // Move to next cell
                            const nextCi = ci + 1 < SNF_COLS.length ? ci + 1 : 0
                            const nextRi = ci + 1 < SNF_COLS.length ? ri : ri + 1
                            if (nextRi < fatRows.length) setEditCell({ ri: nextRi, ci: nextCi })
                            else setEditCell(null)
                          }
                          if (e.key === 'Escape') setEditCell(null)
                        }}
                        style={{
                          width: '100%', height: '100%', border: 'none', background: 'transparent',
                          padding: '3px 6px', fontSize: '0.72rem', fontWeight: fat === highlight ? 700 : 400,
                          color: fat === highlight ? '#B91C1C' : '#1E293B',
                          textAlign: 'right', outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <div style={{
                        padding: '3px 6px', textAlign: 'right', cursor: 'cell',
                        fontWeight: fat === highlight ? 700 : 400,
                        color: isDirty ? '#92400E' : fat === highlight ? '#B91C1C' : '#1E293B',
                        minHeight: 22,
                      }}>
                        {val}
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="page-header no-print">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TableProperties size={26} style={{ color: '#0F6E56' }} /> Rate List
          </h1>
          <p className="page-subtitle">
            Click any cell to edit · {hasDirty ? <span style={{ color: '#D97706', fontWeight: 700 }}>⚠ {dirtySet.size} unsaved change{dirtySet.size > 1 ? 's' : ''}</span> : 'All changes saved'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
          <button className="btn-secondary" onClick={handleLoadPrintoutRates} disabled={loading || saving} title="Load exact rates from printout sheet">
            Load Chart (11.04.2026)
          </button>
          <button className="btn-secondary" onClick={fetchRates} disabled={loading || saving} title="Reset to DB values">
            <RefreshCw size={15} /> Reset
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!hasDirty || saving}
            style={{ opacity: hasDirty ? 1 : 0.5 }}
          >
            <Save size={16} /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="no-print" style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderBottom: '2px solid #E2E8F0' }}>
        <button style={TAB_BTN(tab === 'cow')}     onClick={() => { setTab('cow');     setEditCell(null) }}>🐄 Cow Milk (3.5–5.0 FAT)</button>
        <button style={TAB_BTN(tab === 'buffalo')} onClick={() => { setTab('buffalo'); setEditCell(null) }}>🐃 Buffalo Milk (5.1–10.0 FAT)</button>
      </div>

      {/* Legend */}
      <div className="no-print" style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem', fontSize: '0.78rem', color: '#64748B', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 14, background: '#FFFBEB', border: '1px solid #D97706', borderRadius: 3, display: 'inline-block' }} />
          Edited (unsaved)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 14, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 3, display: 'inline-block' }} />
          Highlighted row
        </span>
        <span style={{ color: '#475569' }}>💡 Click a cell to edit · Enter/Tab to move · Esc to cancel</span>
      </div>

      {/* Print header */}
      <div className="print-only" style={{ textAlign: 'center', marginBottom: '1rem', borderBottom: '2px solid #0F6E56', paddingBottom: '0.75rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.2rem 0' }}>PURCHASE RATE LIST — {tab === 'cow' ? 'COW' : 'BUFFALO'} MILK</h1>
        <p style={{ fontSize: '0.85rem', color: '#475569', margin: 0 }}>Rate List W.E.F. {new Date().toLocaleDateString('en-IN')}</p>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <RateSheet />
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
          table { font-size: 8pt !important; }
          td, th { padding: 2px 3px !important; }
        }
        @media screen { .print-only { display: none; } }
      `}</style>
    </div>
  )
}
