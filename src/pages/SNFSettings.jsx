import { useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'
import { Download, Upload, Settings } from 'lucide-react'

export default function SNFSettings() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)

  const handleExport = async () => {
    setExporting(true)
    const tid = toast.loading('Preparing backup...')
    try {
      const tables = ['farmers', 'snf_slabs', 'milk_collections', 'payments', 'expenses']
      const backup = {}
      for (const t of tables) {
        const { data, error } = await supabase.from(t).select('*')
        if (error) throw error
        backup[t] = data
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `milk_manager_backup_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
      toast.success('Backup exported!', { id: tid })
    } catch (err) {
      toast.error('Export failed: ' + err.message, { id: tid })
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    const tid = toast.loading('Importing backup data...')
    try {
      const data = JSON.parse(await file.text())
      for (const t of ['farmers', 'snf_slabs', 'milk_collections', 'payments', 'expenses']) {
        if (data[t]?.length > 0) {
          const { error } = await supabase.from(t).upsert(data[t])
          if (error) throw error
        }
      }
      toast.success('Data imported successfully!', { id: tid })
    } catch (err) {
      toast.error('Import failed: ' + err.message, { id: tid })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={24} style={{ color: '#0F6E56' }} /> Settings
          </h1>
          <p className="page-subtitle">Database backup and restore</p>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.4rem' }}>📤 Backup Database</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Download a complete JSON backup of all farmers, collections, payments, and rate slabs.
          </p>
          <button className="btn-secondary" onClick={handleExport} disabled={exporting}>
            <Download size={16} /> {exporting ? 'Exporting…' : 'Export Backup'}
          </button>
        </div>

        <div style={{ width: '1px', background: 'var(--border)', alignSelf: 'stretch' }} />

        <div style={{ flex: '1 1 260px' }}>
          <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.4rem' }}>📥 Restore Database</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Restore data from a previously exported JSON backup file.
          </p>
          <input type="file" accept=".json" style={{ display: 'none' }} ref={fileInputRef} onChange={handleImport} />
          <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload size={16} /> {importing ? 'Importing…' : 'Import Backup'}
          </button>
        </div>
      </div>
    </div>
  )
}
