import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel = 'Delete', danger = true }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: danger ? '#FEE2E2' : '#FEF3C7',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1rem'
        }}>
          <AlertTriangle size={26} color={danger ? '#DC2626' : '#D97706'} />
        </div>
        <h3 style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.5rem' }}>{title}</h3>
        <p style={{ color: '#6B7A90', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
