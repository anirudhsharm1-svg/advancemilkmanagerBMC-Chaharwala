import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Farmers from './pages/Farmers'
import FarmerProfile from './pages/FarmerProfile'
import Collections from './pages/Collections'
import Payments from './pages/Payments'
import Reports from './pages/Reports'
import Expenses from './pages/Expenses'
import SNFSettings from './pages/SNFSettings'
import RouteDispatch from './pages/RouteDispatch'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="loading-center" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="farmers" element={<Farmers />} />
        <Route path="farmers/:id" element={<FarmerProfile />} />
        <Route path="collections" element={<Collections />} />
        <Route path="payments" element={<Payments />} />
        <Route path="reports" element={<Reports />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="snf-settings" element={<SNFSettings />} />
        <Route path="route-dispatch" element={<RouteDispatch />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
