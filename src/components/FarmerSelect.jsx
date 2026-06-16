import { useState, useEffect, useRef } from 'react'
import { Search, ChevronDown } from 'lucide-react'

export default function FarmerSelect({ farmers = [], value, onChange, placeholder = 'Select farmer…' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  const selected = farmers.find(f => f.id === value)

  const filtered = search.trim()
    ? farmers.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        f.phone.includes(search)
      )
    : farmers

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="input"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ color: selected ? '#1A2332' : '#9CA3AF' }}>
          {selected ? `${selected.name} — ${selected.phone}` : placeholder}
        </span>
        <ChevronDown size={16} color="#6B7A90" />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'white', border: '1.5px solid #E5E9EE', borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, overflow: 'hidden'
        }}>
          <div style={{ padding: '0.5rem', borderBottom: '1px solid #E5E9EE', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Search size={14} color="#9CA3AF" />
            <input
              autoFocus
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem', fontFamily: 'Inter, sans-serif' }}
              placeholder="Search name or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#9CA3AF', fontSize: '0.875rem' }}>No farmers found</div>
            ) : (
              filtered.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { onChange(f.id); setOpen(false); setSearch('') }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '0.65rem 1rem', border: 'none', background: value === f.id ? '#F0FDF4' : 'transparent',
                    cursor: 'pointer', fontSize: '0.875rem', textAlign: 'left', transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = value === f.id ? '#F0FDF4' : 'transparent'}
                >
                  <span style={{ fontWeight: 500 }}>{f.name}</span>
                  <span style={{ color: '#9CA3AF', fontSize: '0.78rem' }}>{f.phone}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
