import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ReportForm from './pages/ReportForm'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AdminPage from './pages/AdminPage'
import './App.css'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>載入中...</div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppHeader() {
  const { user, logout } = useAuth()
  if (!user) return null
  return (
    <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
      <span style={{ fontSize: 13, color: '#6b7280' }}>{user.username}</span>
      {user.role === 'admin' && (
        <a href="/admin" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}>管理後台</a>
      )}
      <button onClick={logout} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 5, padding: '3px 10px', fontSize: 13, color: '#6b7280', cursor: 'pointer' }}>
        登出
      </button>
    </div>
  )
}

function AppLayout() {
  return (
    <ProtectedRoute>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AppHeader />
        <div style={{ flex: 1 }}>
          <ReportForm />
        </div>
      </div>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
