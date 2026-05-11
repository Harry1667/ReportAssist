import { useState } from 'react'
import { Link } from 'react-router-dom'

const BASE = import.meta.env.VITE_API_BASE ?? ''

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('兩次密碼不一致'); return }
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json() as { ok: boolean; error?: string }
      if (!data.ok) { setError(data.error ?? '註冊失敗'); return }
      setSuccess(true)
    } catch {
      setError('網路錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ maxWidth: 400, paddingTop: 80 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>AI 實驗報告助手</h1>
      </div>

      <div className="step-content">
        <h2 style={{ marginBottom: 20 }}>申請帳號</h2>

        {success ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <p style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a', marginBottom: 8 }}>
              申請已送出
            </p>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
              請等待管理員審核，通過後即可登入使用。
            </p>
            <Link to="/login" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
              返回登入
            </Link>
          </div>
        ) : (
          <>
            {error && <div className="error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>用戶名</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                  autoComplete="username"
                  placeholder="至少 2 個字元"
                />
              </div>
              <div className="field">
                <label>密碼</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="至少 6 個字元"
                />
              </div>
              <div className="field">
                <label>確認密碼</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={loading || !username || !password || !confirm}
                style={{ width: '100%', marginTop: 8 }}
              >
                {loading ? '送出中...' : '申請註冊'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#6b7280' }}>
              已有帳號？ <Link to="/login" style={{ color: '#2563eb' }}>返回登入</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
