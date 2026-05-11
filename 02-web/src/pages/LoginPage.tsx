import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { AuthUser } from '../context/AuthContext'

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function doLogin(username: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return res.json() as Promise<{ ok: boolean; error?: string; token?: string; user?: AuthUser }>
}

function avatarColor(name: string) {
  const colors = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#c026d3', '#65a30d']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length
  return colors[h]
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [userList, setUserList] = useState<{ id: number; username: string }[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Admin modal
  const [showAdmin, setShowAdmin] = useState(false)
  const [adminPass, setAdminPass] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)

  useEffect(() => {
    fetch(`${BASE}/api/auth/users`)
      .then(r => r.json())
      .then((d: { ok: boolean; users?: { id: number; username: string }[] }) => {
        if (d.ok && d.users) setUserList(d.users)
      })
      .catch(() => {})
  }, [])

  function selectUser(username: string) {
    setSelected(username)
    setPassword('')
    setError('')
  }

  function back() {
    setSelected(null)
    setPassword('')
    setError('')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setError('')
    setLoading(true)
    try {
      const data = await doLogin(selected, password)
      if (!data.ok) { setError(data.error ?? '登入失敗'); return }
      login(data.token!, data.user!)
      navigate('/', { replace: true })
    } catch {
      setError('網路錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault()
    setAdminError('')
    setAdminLoading(true)
    try {
      const data = await doLogin('華柏翰', adminPass)
      if (!data.ok) { setAdminError(data.error ?? '登入失敗'); return }
      if (data.user?.role !== 'admin') { setAdminError('此帳號沒有管理員權限'); return }
      flushSync(() => { login(data.token!, data.user!) })
      navigate('/admin', { replace: true })
    } catch {
      setAdminError('網路錯誤，請稍後再試')
    } finally {
      setAdminLoading(false)
    }
  }

  function closeAdmin() {
    setShowAdmin(false)
    setAdminPass('')
    setAdminError('')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>

      <div style={{ width: '100%', maxWidth: 520 }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>📄</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>AI 實驗報告助手</h1>
        </div>

        <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', padding: 28 }}>
          {selected === null ? (
            /* ── User card picker ── */
            <>
              <p style={{ textAlign: 'center', fontSize: 14, color: '#6b7280', margin: '0 0 20px' }}>選擇你的帳號</p>

              {userList.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '20px 0' }}>載入中...</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
                  {userList.map(u => {
                    const color = avatarColor(u.username)
                    return (
                      <button key={u.id} onClick={() => selectUser(u.username)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '18px 8px', borderRadius: 10, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = color; el.style.boxShadow = `0 0 0 3px ${color}18` }}
                        onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = '#e5e7eb'; el.style.boxShadow = 'none' }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: 'white' }}>
                          {u.username[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#374151', wordBreak: 'break-all', textAlign: 'center', lineHeight: 1.3 }}>
                          {u.username}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            /* ── Password input ── */
            <>
              <button onClick={back}
                style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                ← 返回
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: avatarColor(selected), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: 'white', marginBottom: 10 }}>
                  {selected[0].toUpperCase()}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{selected}</div>
              </div>

              {error && <div className="error">{error}</div>}
              <form onSubmit={handleLogin}>
                <div className="field">
                  <label>密碼</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
                </div>
                <button type="submit" className="btn-primary" disabled={loading || !password} style={{ width: '100%', marginTop: 4 }}>
                  {loading ? '登入中...' : '登入'}
                </button>
              </form>
            </>
          )}

          <p style={{ textAlign: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid #f3f4f6', fontSize: 13, color: '#6b7280', margin: '20px 0 0' }}>
            還沒有帳號？<Link to="/register" style={{ color: '#2563eb' }}>申請註冊</Link>
            <span style={{ margin: '0 8px', color: '#d1d5db' }}>|</span>
            <button type="button" onClick={() => setShowAdmin(true)}
              style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', padding: 0 }}>
              管理員登入
            </button>
          </p>
        </div>
      </div>

      {/* Admin login modal */}
      {showAdmin && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) closeAdmin() }}
        >
          <div style={{ background: 'white', borderRadius: 10, padding: 28, width: '100%', maxWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🛡️ 管理員登入</h2>
              <button onClick={closeAdmin} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
            </div>

            {adminError && <div className="error" style={{ marginBottom: 14 }}>{adminError}</div>}

            <form onSubmit={handleAdminLogin}>
              <div className="field">
                <label>管理員密碼</label>
                <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} autoFocus autoComplete="current-password" />
              </div>
              <button type="submit" className="btn-primary" disabled={adminLoading || !adminPass} style={{ width: '100%', marginTop: 4 }}>
                {adminLoading ? '驗證中...' : '進入管理後台'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
