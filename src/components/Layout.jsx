import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { Menu } from 'lucide-react'

export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false) // Hidden by default

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <main className={`main-content ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center' }}>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className="btn-ghost" 
            style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Toggle Sidebar"
          >
            <Menu size={24} />
          </button>
        </div>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
