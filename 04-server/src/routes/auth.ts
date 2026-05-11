import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import db from '../db'

export const authRoute = new Hono()

// GET /api/auth/users — public list of approved users for login picker
authRoute.get('/users', (c) => {
  const users = db.prepare(
    "SELECT id, username FROM users WHERE status = 'approved' ORDER BY username ASC"
  ).all() as { id: number; username: string }[]
  return c.json({ ok: true, users })
})

// POST /api/auth/register
authRoute.post('/register', async (c) => {
  let body: { username?: string; password?: string }
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: '請求格式錯誤' }, 400) }

  const username = (body.username ?? '').trim()
  const password = body.password ?? ''

  if (!username || !password) return c.json({ ok: false, error: '請填寫用戶名和密碼' }, 400)
  if (username.length < 2) return c.json({ ok: false, error: '用戶名至少 2 個字元' }, 400)
  if (password.length < 6) return c.json({ ok: false, error: '密碼至少 6 個字元' }, 400)

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) return c.json({ ok: false, error: '用戶名已存在' }, 409)

  const hash = await Bun.password.hash(password)
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash)
  return c.json({ ok: true, message: '註冊成功，請等待管理員審核後再登入' })
})

// POST /api/auth/login
authRoute.post('/login', async (c) => {
  let body: { username?: string; password?: string }
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: '請求格式錯誤' }, 400) }

  const username = (body.username ?? '').trim()
  const password = body.password ?? ''
  if (!username || !password) return c.json({ ok: false, error: '請填寫用戶名和密碼' }, 400)

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as {
    id: number; username: string; password_hash: string; role: string; status: string
  } | null
  if (!user) return c.json({ ok: false, error: '用戶名或密碼錯誤' }, 401)

  const valid = await Bun.password.verify(password, user.password_hash)
  if (!valid) return c.json({ ok: false, error: '用戶名或密碼錯誤' }, 401)

  if (user.status === 'pending') return c.json({ ok: false, error: '帳號尚待審核，請等待管理員批准' }, 403)
  if (user.status === 'rejected') return c.json({ ok: false, error: '帳號審核未通過，請聯絡管理員' }, 403)

  const secret = process.env.JWT_SECRET ?? 'dev-secret-change-me'
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7  // 7 days
  const token = await sign({ sub: user.id, role: user.role, exp }, secret)

  return c.json({ ok: true, token, user: { id: user.id, username: user.username, role: user.role } })
})

// GET /api/auth/usage — return current week's usage count + limit
authRoute.get('/usage', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return c.json({ ok: false }, 401)
  try {
    const secret = process.env.JWT_SECRET ?? 'dev-secret-change-me'
    const payload = await verify(authHeader.slice(7), secret, 'HS256') as { sub: number }
    const user = db.prepare('SELECT weekly_limit FROM users WHERE id = ? AND status = ?').get(payload.sub, 'approved') as { weekly_limit: number } | null
    if (!user) return c.json({ ok: false }, 401)

    // Monday 00:00 Taiwan time (UTC+8) = Sunday 16:00 UTC
    const now = new Date()
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const taiwan = new Date(utc + 8 * 3600000)
    const day = taiwan.getDay()
    const daysSinceMonday = day === 0 ? 6 : day - 1
    taiwan.setHours(0, 0, 0, 0)
    taiwan.setDate(taiwan.getDate() - daysSinceMonday)
    const weekStart = Math.floor((taiwan.getTime() - 8 * 3600000) / 1000)

    const row = db.prepare('SELECT COUNT(*) as cnt FROM usage_logs WHERE user_id = ? AND created_at >= ?').get(payload.sub, weekStart) as { cnt: number }
    return c.json({ ok: true, used: row.cnt, limit: user.weekly_limit })
  } catch {
    return c.json({ ok: false }, 401)
  }
})

// PATCH /api/auth/profile — change own username / password
authRoute.patch('/profile', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return c.json({ ok: false }, 401)
  try {
    const secret = process.env.JWT_SECRET ?? 'dev-secret-change-me'
    const payload = await verify(authHeader.slice(7), secret, 'HS256') as { sub: number }
    const user = db.prepare('SELECT id, username, password_hash, status FROM users WHERE id = ?').get(payload.sub) as {
      id: number; username: string; password_hash: string; status: string
    } | null
    if (!user || user.status !== 'approved') return c.json({ ok: false }, 401)

    let body: { username?: string; password?: string; currentPassword?: string }
    try { body = await c.req.json() } catch { return c.json({ ok: false, error: '格式錯誤' }, 400) }

    // Verify current password
    if (!body.currentPassword) return c.json({ ok: false, error: '請輸入目前密碼' }, 400)
    const valid = await Bun.password.verify(body.currentPassword, user.password_hash)
    if (!valid) return c.json({ ok: false, error: '目前密碼錯誤' }, 400)

    if (body.username !== undefined) {
      const u = body.username.trim()
      if (u.length < 2) return c.json({ ok: false, error: '用戶名至少 2 個字元' }, 400)
      const conflict = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(u, user.id)
      if (conflict) return c.json({ ok: false, error: '用戶名已存在' }, 409)
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(u, user.id)
    }
    if (body.password !== undefined && body.password !== '') {
      if (body.password.length < 6) return c.json({ ok: false, error: '新密碼至少 6 個字元' }, 400)
      const hash = await Bun.password.hash(body.password)
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id)
    }
    const updated = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(user.id) as { id: number; username: string; role: string }
    return c.json({ ok: true, user: updated })
  } catch {
    return c.json({ ok: false }, 401)
  }
})

// GET /api/auth/me — verify token and return current user
authRoute.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return c.json({ ok: false }, 401)
  try {
    const secret = process.env.JWT_SECRET ?? 'dev-secret-change-me'
    const payload = await verify(authHeader.slice(7), secret, 'HS256') as { sub: number }
    const user = db.prepare(
      'SELECT id, username, role, status FROM users WHERE id = ?'
    ).get(payload.sub) as { id: number; username: string; role: string; status: string } | null
    if (!user || user.status !== 'approved') return c.json({ ok: false }, 401)
    return c.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } })
  } catch {
    return c.json({ ok: false }, 401)
  }
})
