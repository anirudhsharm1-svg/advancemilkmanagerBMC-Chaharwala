import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, formatLiters, todayStr } from '../utils/formatters'
import StatCard from '../components/StatCard'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'

const COLORS = { primary: '#0F6E56', accent: '#F97316', blue: '#3B82F6', purple: '#8B5CF6' }

function ChartCard({ title, children }) {
  return (
    <div className="card">
      <p style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1A2332', marginBottom: '1rem' }}>{title}</p>
      {children}
    </div>
  )
}

function CustomTooltip({ active, payload, label, prefix = '', suffix = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'white', border: '1px solid #E5E9EE', borderRadius: 10, padding: '0.65rem 1rem', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: '0.82rem' }}>
      <p style={{ fontWeight: 600, marginBottom: '0.3rem', color: '#6B7A90' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, fontWeight: 700 }}>{p.name}: {prefix}{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}{suffix}</p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({ todayLiters: 0, todayRevenue: 0, totalFarmers: 0, pendingDues: 0 })
  const [dailyData, setDailyData] = useState([])
  const [weeklyData, setWeeklyData] = useState([])
  const [shiftData, setShiftData] = useState([])
  const [monthlyProfit, setMonthlyProfit] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchDashboard() }, [])

  const fetchDashboard = async () => {
    setLoading(true)
    const today = todayStr()
    const [farmersRes, todayColRes, allColRes, allPayRes, expRes] = await Promise.all([
      supabase.from('farmers').select('id, balance'),
      supabase.from('milk_collections').select('quantity_liters, total_amount, shift').eq('collection_date', today),
      supabase.from('milk_collections').select('collection_date, quantity_liters, total_amount, shift').order('collection_date'),
      supabase.from('payments').select('payment_date, amount'),
      supabase.from('expenses').select('expense_date, amount'),
    ])

    const farmers = farmersRes.data || []
    const todayCols = todayColRes.data || []
    const allCols = allColRes.data || []
    const allPays = allPayRes.data || []
    const allExps = expRes.data || []

    // Today stats
    const todayLiters = todayCols.reduce((s, c) => s + parseFloat(c.quantity_liters), 0)
    const todayRevenue = todayCols.reduce((s, c) => s + parseFloat(c.total_amount), 0)
    const pendingDues = farmers.reduce((s, f) => {
      const b = parseFloat(f.balance)
      return b < 0 ? s + Math.abs(b) : s
    }, 0)

    setStats({ todayLiters, todayRevenue, totalFarmers: farmers.length, pendingDues })

    // Last 30 days daily collections
    const days30 = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const ds = d.toISOString().split('T')[0]
      const dayLabel = `${d.getDate()}/${d.getMonth() + 1}`
      const dayCols = allCols.filter(c => c.collection_date === ds)
      days30.push({
        date: dayLabel,
        liters: Math.round(dayCols.reduce((s, c) => s + parseFloat(c.quantity_liters), 0) * 100) / 100,
      })
    }
    setDailyData(days30)

    // Weekly revenue comparison
    const weekLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const thisWeek = []; const lastWeek = []
    for (let i = 0; i < 7; i++) {
      const thisD = new Date(); thisD.setDate(thisD.getDate() - (thisD.getDay() || 7) + 1 + i)
      const lastD = new Date(thisD); lastD.setDate(thisD.getDate() - 7)
      const tds = thisD.toISOString().split('T')[0]
      const lds = lastD.toISOString().split('T')[0]
      thisWeek.push(allCols.filter(c => c.collection_date === tds).reduce((s, c) => s + parseFloat(c.total_amount), 0))
      lastWeek.push(allCols.filter(c => c.collection_date === lds).reduce((s, c) => s + parseFloat(c.total_amount), 0))
    }
    setWeeklyData(weekLabels.map((l, i) => ({ day: l, thisWeek: Math.round(thisWeek[i] * 100) / 100, lastWeek: Math.round(lastWeek[i] * 100) / 100 })))

    // Shift split (last 30 days)
    const recentCols = allCols.filter(c => c.collection_date >= days30[0]?.dateRaw || true)
    const morningLiters = allCols.filter(c => c.shift === 'morning').reduce((s, c) => s + parseFloat(c.quantity_liters), 0)
    const eveningLiters = allCols.filter(c => c.shift === 'evening').reduce((s, c) => s + parseFloat(c.quantity_liters), 0)
    setShiftData([
      { name: 'Morning', value: Math.round(morningLiters * 100) / 100 },
      { name: 'Evening', value: Math.round(eveningLiters * 100) / 100 },
    ])

    // Monthly profit (last 6 months)
    const monthly = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      const yr = d.getFullYear(); const mo = String(d.getMonth() + 1).padStart(2, '0')
      const prefix = `${yr}-${mo}`
      const rev = allCols.filter(c => c.collection_date.startsWith(prefix)).reduce((s, c) => s + parseFloat(c.total_amount), 0)
      const exp = allExps.filter(e => e.expense_date.startsWith(prefix)).reduce((s, e) => s + parseFloat(e.amount), 0)
      monthly.push({ month: `${d.toLocaleString('default', { month: 'short' })} ${yr}`, revenue: Math.round(rev), expenses: Math.round(exp), profit: Math.round(rev - exp) })
    }
    setMonthlyProfit(monthly)

    setLoading(false)
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of today's dairy operations</p>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard icon="🥛" label="Today's Collection" value={`${formatLiters(stats.todayLiters)} L`} sub="Total milk collected today" color="#0F6E56" bgColor="#F0FDF4" />
        <StatCard icon="💰" label="Today's Revenue" value={formatCurrency(stats.todayRevenue)} sub="Earnings from today" color="#EA580C" bgColor="#FFF7ED" />
        <StatCard icon="👨‍🌾" label="Total Farmers" value={stats.totalFarmers} sub="Registered farmers" color="#2563EB" bgColor="#EFF6FF" />
        <StatCard icon="⚠️" label="Pending Dues" value={formatCurrency(stats.pendingDues)} sub="Total outstanding dues" color="#DC2626" bgColor="#FEF2F2" />
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <ChartCard title="📈 Daily Milk Collection — Last 30 Days">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B7A90' }} interval={4} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7A90' }} />
              <Tooltip content={<CustomTooltip suffix=" L" />} />
              <Line type="monotone" dataKey="liters" stroke={COLORS.primary} strokeWidth={2.5} dot={false} name="Liters" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="📊 Weekly Revenue Comparison">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6B7A90' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7A90' }} />
              <Tooltip content={<CustomTooltip prefix="₹" />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="thisWeek" fill={COLORS.primary} name="This Week" radius={[4, 4, 0, 0]} />
              <Bar dataKey="lastWeek" fill="#BBF7D0" name="Last Week" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="🌅 Morning vs Evening Shift Split">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={shiftData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                dataKey="value" nameKey="name" paddingAngle={3}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}>
                <Cell fill={COLORS.accent} />
                <Cell fill={COLORS.blue} />
              </Pie>
              <Tooltip formatter={(v) => [`${v.toFixed(2)} L`, '']} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="💹 Monthly Profit Trend (Last 6 Months)">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyProfit}>
              <defs>
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7A90' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7A90' }} />
              <Tooltip content={<CustomTooltip prefix="₹" />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" stroke={COLORS.blue} fill="transparent" strokeWidth={2} name="Revenue" />
              <Area type="monotone" dataKey="expenses" stroke={COLORS.accent} fill="transparent" strokeWidth={2} strokeDasharray="5 5" name="Expenses" />
              <Area type="monotone" dataKey="profit" stroke={COLORS.primary} fill="url(#profitGrad)" strokeWidth={2.5} name="Profit" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
