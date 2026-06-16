export function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '₹0.00'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

export function toInputDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

export function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export function formatFAT(fat) {
  return parseFloat(fat).toFixed(1)
}

export function formatLiters(liters) {
  return parseFloat(liters).toFixed(2)
}

export function formatNumber(n) {
  return new Intl.NumberFormat('en-IN').format(n)
}

export function getMonthName(month) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return months[month - 1] || ''
}

export function currentMonth() {
  return String(new Date().getMonth() + 1).padStart(2, '0')
}

export function currentYear() {
  return String(new Date().getFullYear())
}

export function formatPaymentMode(mode) {
  const map = { cash: 'Cash', bank_transfer: 'Bank Transfer', upi: 'UPI' }
  return map[mode] || mode
}

export function formatCategory(cat) {
  const map = { fuel: 'Fuel', maintenance: 'Maintenance', salary: 'Salary', other: 'Other' }
  return map[cat] || cat
}
