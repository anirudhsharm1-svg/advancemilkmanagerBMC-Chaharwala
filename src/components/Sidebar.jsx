import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Droplets, CreditCard,
  BarChart2, Receipt, Settings, LogOut, Truck
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/',              label: 'Dashboard',      icon: LayoutDashboard, end: true },
  { to: '/farmers',       label: 'Farmers',         icon: Users },
  { to: '/collections',  label: 'Collections',     icon: Droplets },
  { to: '/payments',     label: 'Payments',        icon: CreditCard },
  { to: '/reports',      label: 'Reports',         icon: BarChart2 },
  { to: '/expenses',     label: 'Expenses',        icon: Receipt },
  { to: '/route-dispatch', label: 'Route Dispatch', icon: Truck },
  { to: '/snf-settings', label: 'Settings',        icon: Settings },
]

export default function Sidebar({ isOpen, setIsOpen }) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    toast.success('Logged out successfully')
    navigate('/login')
  }

  // Close sidebar on mobile after clicking a link
  const handleNavClick = () => {
    if (window.innerWidth <= 768 && setIsOpen) {
      setIsOpen(false)
    }
  }

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🥛</div>
        <div>
          <div className="sidebar-logo-text">Milk Manager</div>
          <div className="sidebar-logo-sub">Dairy Management System</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={handleNavClick}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon className="nav-icon" size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="nav-item" onClick={handleLogout} style={{ width: '100%' }}>
          <LogOut size={18} className="nav-icon" />
          Logout
        </button>
      </div>
    </aside>
  )
}
