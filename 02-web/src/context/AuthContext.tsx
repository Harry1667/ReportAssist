import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export interface AuthUser {
  id: number
  username: string
  role: 'user' | 'admin'
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  login: (token: string, user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'ra_token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (!stored) { setIsLoading(false); return }

    const BASE = import.meta.env.VITE_API_BASE ?? ''
    fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${stored}` } })
      .then(r => r.json())
      .then((data: { ok: boolean; user?: AuthUser }) => {
        if (data.ok && data.user) {
          setToken(stored)
          setUser(data.user)
        } else {
          localStorage.removeItem(TOKEN_KEY)
        }
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setIsLoading(false))
  }, [])

  function login(t: string, u: AuthUser) {
    localStorage.setItem(TOKEN_KEY, t)
    setToken(t)
    setUser(u)
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
