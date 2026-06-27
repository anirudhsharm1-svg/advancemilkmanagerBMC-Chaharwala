import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { calculateMilkRate, fetchAndCacheCustomRates, setCustomRatesCache, getCustomRatesCache } from '../utils/rateCalculator'
import toast from 'react-hot-toast'
import { Printer, TableProperties, Save, RefreshCw, Download, Upload } from 'lucide-react'

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
  const [cowGrid, setCowGrid]       = useState([])       // [fatRow][snfCol]
  const [buffGrid, setBuffGrid]     = useState([])
  const [dirtySet, setDirtySet]     = useState(new Set()) // "fat_snf_type" keys
  const [editCell, setEditCell]     = useState(null)     // {ri, ci}
  const csvInputRef = useRef(null)

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

  const ALL_FAT_ROWS = [...COW_FAT_ROWS, ...BUFF_FAT_ROWS]

  // Export all rates (Cow & Buffalo) to a single CSV
  const handleExportCSV = () => {
    try {
      const headers = ['Fat/SNF', ...SNF_COLS.map(s => (s / 10).toFixed(1))].join(',')
      const rows = ALL_FAT_ROWS.map((fat, ri) => {
        const isRowCow = ri < COW_FAT_ROWS.length
        const localRi = isRowCow ? ri : ri - COW_FAT_ROWS.length
        const rowGrid = isRowCow ? cowGrid : buffGrid
        
        const rowCells = [fat.toFixed(1)]
        SNF_COLS.forEach((snf, ci) => {
          rowCells.push(rowGrid[localRi]?.[ci] ?? '')
        })
        return rowCells.join(',')
      })
      const csvContent = [headers, ...rows].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `milk_rate_list_combined_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Combined rate list exported as CSV!')
    } catch (err) {
      toast.error('Export failed: ' + err.message)
    }
  }

  // Import Cow and Buffalo rates from a single CSV
  const handleImportCSV = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target.result
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        if (lines.length < 2) {
          toast.error('Invalid CSV file: File is empty or has no data.')
          return
        }

        // First line is header, e.g. "Fat/SNF,9.2,9.1,..."
        const headerParts = lines[0].split(',')
        const snfValues = headerParts.slice(1).map(h => Math.round(parseFloat(h) * 10))

        const hasValidSNF = snfValues.every(v => !isNaN(v))
        if (!hasValidSNF) {
          toast.error('Invalid CSV header: SNF values must be numbers.')
          return
        }

        const parsedCowRows = []
        const parsedBuffRows = []

        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',')
          if (parts.length < 2) continue
          const fat = parseFloat(parts[0])
          if (isNaN(fat)) continue

          const rates = parts.slice(1).map(v => v.trim())
          if (fat >= 3.5 && fat <= 5.0) {
            parsedCowRows.push({ fat, rates })
          } else if (fat >= 5.1 && fat <= 10.0) {
            parsedBuffRows.push({ fat, rates })
          }
        }

        const newCowGrid = COW_FAT_ROWS.map(fat =>
          SNF_COLS.map(snf => {
            const matchRow = parsedCowRows.find(r => Math.abs(r.fat - fat) < 0.05)
            if (!matchRow) return ''
            const csvColIdx = snfValues.indexOf(snf)
            if (csvColIdx === -1) return ''
            const val = matchRow.rates[csvColIdx]
            return val !== undefined && val !== '' ? parseFloat(val).toFixed(2) : ''
          })
        )

        const newBuffGrid = BUFF_FAT_ROWS.map(fat =>
          SNF_COLS.map(snf => {
            const matchRow = parsedBuffRows.find(r => Math.abs(r.fat - fat) < 0.05)
            if (!matchRow) return ''
            const csvColIdx = snfValues.indexOf(snf)
            if (csvColIdx === -1) return ''
            const val = matchRow.rates[csvColIdx]
            return val !== undefined && val !== '' ? parseFloat(val).toFixed(2) : ''
          })
        )

        setCowGrid(newCowGrid)
        setBuffGrid(newBuffGrid)

        setDirtySet(prev => {
          const next = new Set(prev)
          COW_FAT_ROWS.forEach(fat => {
            SNF_COLS.forEach(snf => {
              next.add(`${fat}_${snf}_cow`)
            })
          })
          BUFF_FAT_ROWS.forEach(fat => {
            SNF_COLS.forEach(snf => {
              next.add(`${fat}_${snf}_buffalo`)
            })
          })
          return next
        })

        toast.success('Imported Cow & Buffalo rates! Click "Save Changes" to save to the database.')
      } catch (err) {
        toast.error('Failed to parse CSV: ' + err.message)
      } finally {
        if (csvInputRef.current) csvInputRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  // Cell change handler
  const handleChange = (ri, ci, val) => {
    const isRowCow = ri < COW_FAT_ROWS.length
    const localRi = isRowCow ? ri : ri - COW_FAT_ROWS.length
    const targetGridSet = isRowCow ? setCowGrid : setBuffGrid
    const rowType = isRowCow ? 'cow' : 'buffalo'
    const rowFat = isRowCow ? COW_FAT_ROWS[localRi] : BUFF_FAT_ROWS[localRi]

    targetGridSet(prev => {
      const next = prev.map(r => [...r])
      next[localRi][ci] = val
      return next
    })
    const key = `${rowFat.toFixed(1)}_${SNF_COLS[ci]}_${rowType}`
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
  const fatCellStyle = (fat, highlightVal) => ({
    padding: '2px 8px', border: '1px solid #CBD5E1', textAlign: 'center',
    fontSize: '0.72rem', fontWeight: fat === highlightVal ? 700 : 600,
    color: fat === highlightVal ? '#B91C1C' : '#334155',
    background: fat === highlightVal ? '#FEF2F2' : '#F1F5F9',
    whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1,
  })

  const cellBg = (fat, isDirty, highlightVal) => {
    if (isDirty)         return '#FFFBEB'
    if (fat === highlightVal) return '#FEF2F2'
    return 'white'
  }

  const RateSheet = () => {
    const renderRows = []
    ALL_FAT_ROWS.forEach((fat, ri) => {
      const isRowCow = ri < COW_FAT_ROWS.length
      const localRi = isRowCow ? ri : ri - COW_FAT_ROWS.length
      const rowGrid = isRowCow ? cowGrid : buffGrid
      const rowType = isRowCow ? 'cow' : 'buffalo'
      const highlightVal = isRowCow ? COW_HIGHLIGHT : BUFF_HIGHLIGHT

      if (ri === 0) {
        renderRows.push(
          <tr key="cow-header-row" className="no-print" style={{ background: '#E2F0EC' }}>
            <td colSpan={SNF_COLS.length + 1} style={{ padding: '6px 10px', fontWeight: 800, color: '#0F6E56', fontSize: '0.78rem' }}>
              🐄 COW MILK RATES (FAT 3.5 – 5.0)
            </td>
          </tr>
        )
      } else if (ri === COW_FAT_ROWS.length) {
        renderRows.push(
          <tr key="buff-header-row" className="no-print" style={{ background: '#E0F2FE' }}>
            <td colSpan={SNF_COLS.length + 1} style={{ padding: '6px 10px', fontWeight: 800, color: '#0369A1', fontSize: '0.78rem' }}>
              🐃 BUFFALO MILK RATES (FAT 5.1 – 10.0)
            </td>
          </tr>
        )
      }

      renderRows.push(
        <tr key={`${fat.toFixed(1)}_${rowType}`}>
          <td style={fatCellStyle(fat, highlightVal)}>{fat.toFixed(1)}</td>
          {SNF_COLS.map((snf, ci) => {
            const isDirty = dirtySet.has(`${fat.toFixed(1)}_${snf}_${rowType}`)
            const isEditing = editCell?.ri === ri && editCell?.ci === ci
            const val = rowGrid[localRi]?.[ci] ?? ''
            return (
              <td
                key={snf}
                style={{
                  padding: 0, border: '1px solid #CBD5E1',
                  background: cellBg(fat, isDirty, highlightVal),
                  outline: isEditing ? '2px solid #0F6E56' : 'none',
                  outlineOffset: -2,
                }}
                onClick={() => setEditCell({ ri, ci })}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    type="text"
                    inputMode="decimal"
                    value={val}
                    onChange={e => {
                      const value = e.target.value
                      if (value === '' || /^\d*\.?\d*$/.test(value)) {
                        handleChange(ri, ci, value)
                      }
                    }}
                    onBlur={() => setEditCell(null)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault()
                        // Move to next cell
                        const nextCi = ci + 1 < SNF_COLS.length ? ci + 1 : 0
                        const nextRi = ci + 1 < SNF_COLS.length ? ri : ri + 1
                        if (nextRi < ALL_FAT_ROWS.length) setEditCell({ ri: nextRi, ci: nextCi })
                        else setEditCell(null)
                      }
                      if (e.key === 'Escape') setEditCell(null)

                      // Arrow keys navigation
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        if (ri > 0) setEditCell({ ri: ri - 1, ci })
                      }
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        if (ri < ALL_FAT_ROWS.length - 1) setEditCell({ ri: ri + 1, ci })
                      }
                      if (e.key === 'ArrowLeft') {
                        const isStart = e.target.selectionStart === 0 && e.target.selectionEnd === 0
                        if (isStart) {
                          e.preventDefault()
                          if (ci > 0) setEditCell({ ri, ci: ci - 1 })
                        }
                      }
                      if (e.key === 'ArrowRight') {
                        const valStr = String(val)
                        const isEnd = e.target.selectionStart === valStr.length && e.target.selectionEnd === valStr.length
                        if (isEnd) {
                          e.preventDefault()
                          if (ci < SNF_COLS.length - 1) setEditCell({ ri, ci: ci + 1 })
                        }
                      }
                    }}
                    style={{
                      width: '100%', height: '100%', border: 'none', background: 'transparent',
                      padding: '3px 6px', fontSize: '0.72rem', fontWeight: fat === highlightVal ? 700 : 400,
                      color: fat === highlightVal ? '#B91C1C' : '#1E293B',
                      textAlign: 'right', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                ) : (
                  <div style={{
                    padding: '3px 6px', textAlign: 'right', cursor: 'cell',
                    fontWeight: fat === highlightVal ? 700 : 400,
                    color: isDirty ? '#92400E' : fat === highlightVal ? '#B91C1C' : '#1E293B',
                    minHeight: 22,
                  }}>
                    {val}
                  </div>
                )}
              </td>
            )
          })}
        </tr>
      )
    })

    return (
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
            {renderRows}
          </tbody>
        </table>
      </div>
    )
  }

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
          <button className="btn-secondary" onClick={handleExportCSV} disabled={loading} title="Export current sheet as CSV">
            <Download size={15} /> Export CSV
          </button>
          <button className="btn-secondary" onClick={() => csvInputRef.current?.click()} disabled={loading || saving} title="Import sheet from CSV">
            <Upload size={15} /> Import CSV
          </button>
          <input
            type="file"
            accept=".csv"
            ref={csvInputRef}
            onChange={handleImportCSV}
            style={{ display: 'none' }}
          />
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

      {/* Description Info */}
      <div className="no-print" style={{ marginBottom: '1.25rem', fontSize: '0.82rem', color: '#64748B' }}>
        View and edit all purchase rates in one place. Cow rates apply for <strong>FAT 3.5 – 5.0</strong>, Buffalo rates apply for <strong>FAT 5.1 – 10.0</strong>.
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
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.2rem 0' }}>PURCHASE RATE LIST (COW &amp; BUFFALO)</h1>
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
