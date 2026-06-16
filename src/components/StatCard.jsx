export default function StatCard({ icon, label, value, sub, color = '#0F6E56', bgColor = '#F0FDF4' }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bgColor }}>
        <span style={{ color, fontSize: '1.4rem' }}>{icon}</span>
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7A90', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
          {label}
        </p>
        <p style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A2332', lineHeight: 1.1 }}>
          {value}
        </p>
        {sub && (
          <p style={{ fontSize: '0.78rem', color: '#6B7A90', marginTop: '0.2rem' }}>{sub}</p>
        )}
      </div>
    </div>
  )
}
