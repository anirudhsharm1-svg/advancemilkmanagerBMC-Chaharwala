import { useState } from 'react'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 10

export default function DataTable({
  columns,
  data = [],
  searchKeys = [],
  emptyMessage = 'No records found.',
  onRowClick,
  pageSize = PAGE_SIZE,
  actions,
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filtered = search.trim()
    ? data.filter(row =>
        searchKeys.some(key =>
          String(row[key] ?? '').toLowerCase().includes(search.toLowerCase())
        )
      )
    : data

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleSearch = (e) => {
    setSearch(e.target.value)
    setPage(1)
  }

  return (
    <div>
      {searchKeys.length > 0 && (
        <div className="filters-row">
          <div className="search-wrap">
            <Search size={15} className="search-icon" />
            <input
              className="input"
              placeholder="Search…"
              value={search}
              onChange={handleSearch}
            />
          </div>
          {actions}
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} style={col.style}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <p>{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => (
                <tr
                  key={row.id ?? i}
                  onClick={() => onRowClick?.(row)}
                  style={onRowClick ? { cursor: 'pointer' } : {}}
                >
                  {columns.map(col => (
                    <td key={col.key} style={col.tdStyle}>
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {filtered.length > pageSize && (
          <div className="pagination">
            <span>Showing {Math.min((page - 1) * pageSize + 1, filtered.length)}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft size={14} />
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
