import { Hono } from 'hono'
import { requireAdmin } from '../middleware/requireAuth'
import type { AppEnv } from '../types'
import db from '../db'

export const adminRoute = new Hono<AppEnv>()
adminRoute.use('*', requireAdmin)

// GET /api/admin/users
adminRoute.get('/users', (c) => {
  const users = db.prepare(`
    SELECT
      u.id, u.username, u.role, u.status, u.weekly_limit, u.created_at,
      COUNT(l.id)                                          AS usage_count,
      COALESCE(SUM(l.input_tokens + l.output_tokens), 0)  AS total_tokens
    FROM users u
    LEFT JOIN usage_logs l ON l.user_id = u.id
    GROUP BY u.id
    ORDER BY
      CASE u.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      u.created_at DESC
  `).all() as {
    id: number; username: string; role: string; status: string
    weekly_limit: number; created_at: number; usage_count: number; total_tokens: number
  }[]
  return c.json({ ok: true, users })
})

// POST /api/admin/users — create user directly (approved by default)
adminRoute.post('/users', async (c) => {
  let body: { username?: string; password?: string; role?: string; weekly_limit?: number }
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: '格式錯誤' }, 400) }

  const username = (body.username ?? '').trim()
  const password = body.password ?? ''
  const role = body.role ?? 'user'

  if (!username || !password) return c.json({ ok: false, error: '請填寫用戶名和密碼' }, 400)
  if (username.length < 2) return c.json({ ok: false, error: '用戶名至少 2 個字元' }, 400)
  if (password.length < 6) return c.json({ ok: false, error: '密碼至少 6 個字元' }, 400)
  if (!['user', 'admin'].includes(role)) return c.json({ ok: false, error: '無效的角色' }, 400)

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) return c.json({ ok: false, error: '用戶名已存在' }, 409)

  const weeklyLimit = body.weekly_limit !== undefined ? Number(body.weekly_limit) : -1
  const hash = await Bun.password.hash(password)
  const result = db.prepare(
    "INSERT INTO users (username, password_hash, role, status, weekly_limit) VALUES (?, ?, ?, 'approved', ?)"
  ).run(username, hash, role, weeklyLimit) as { lastInsertRowid: number }

  return c.json({ ok: true, id: result.lastInsertRowid })
})

// PATCH /api/admin/users/:id — update username / password / status / role / weekly_limit
adminRoute.patch('/users/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const self = c.get('userId')
  let body: { username?: string; password?: string; status?: string; role?: string; weekly_limit?: number }
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: '格式錯誤' }, 400) }

  if (id === self && body.role === 'user')
    return c.json({ ok: false, error: '不能降低自己的權限' }, 400)

  if (body.username !== undefined) {
    const u = body.username.trim()
    if (u.length < 2) return c.json({ ok: false, error: '用戶名至少 2 個字元' }, 400)
    const conflict = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(u, id)
    if (conflict) return c.json({ ok: false, error: '用戶名已存在' }, 409)
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(u, id)
  }
  if (body.password !== undefined && body.password !== '') {
    if (body.password.length < 6) return c.json({ ok: false, error: '密碼至少 6 個字元' }, 400)
    const hash = await Bun.password.hash(body.password)
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id)
  }
  if (body.status !== undefined) {
    if (!['pending', 'approved', 'rejected'].includes(body.status))
      return c.json({ ok: false, error: '無效的狀態' }, 400)
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(body.status, id)
  }
  if (body.role !== undefined) {
    if (!['user', 'admin'].includes(body.role))
      return c.json({ ok: false, error: '無效的角色' }, 400)
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.role, id)
  }
  if (body.weekly_limit !== undefined) {
    db.prepare('UPDATE users SET weekly_limit = ? WHERE id = ?').run(Number(body.weekly_limit), id)
  }
  return c.json({ ok: true })
})

// POST /api/admin/users/bulk-approve — approve all pending users
adminRoute.post('/users/bulk-approve', (c) => {
  const result = db.prepare("UPDATE users SET status = 'approved' WHERE status = 'pending'").run() as { changes: number }
  return c.json({ ok: true, approved: result.changes })
})

// DELETE /api/admin/users/:id
adminRoute.delete('/users/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (id === c.get('userId')) return c.json({ ok: false, error: '不能刪除自己' }, 400)
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  return c.json({ ok: true })
})

// GET /api/admin/logs — all logs across all users
adminRoute.get('/logs', (c) => {
  const logs = db.prepare(`
    SELECT l.id, l.user_id, u.username, l.created_at,
           l.experiment_number, l.experiment_title,
           l.input_tokens, l.output_tokens, l.input_json, l.report_json
    FROM usage_logs l
    JOIN users u ON u.id = l.user_id
    ORDER BY l.created_at DESC
    LIMIT 200
  `).all() as {
    id: number; user_id: number; username: string; created_at: number
    experiment_number: string; experiment_title: string
    input_tokens: number; output_tokens: number
    input_json: string; report_json: string
  }[]
  return c.json({ ok: true, logs })
})

// GET /api/admin/stats — daily usage for last 14 days
adminRoute.get('/stats', (c) => {
  const daily = db.prepare(`
    SELECT
      date(created_at, 'unixepoch', '+8 hours') AS day,
      COUNT(*)                                   AS count,
      SUM(input_tokens + output_tokens)          AS tokens
    FROM usage_logs
    WHERE created_at >= strftime('%s', 'now', '-13 days')
    GROUP BY day
    ORDER BY day ASC
  `).all() as { day: string; count: number; tokens: number }[]

  const totals = db.prepare(`
    SELECT COUNT(*) AS total_logs,
           COUNT(DISTINCT user_id) AS active_users,
           SUM(input_tokens + output_tokens) AS total_tokens
    FROM usage_logs
  `).get() as { total_logs: number; active_users: number; total_tokens: number }

  return c.json({ ok: true, daily, totals })
})

// GET /api/admin/users/:id/logs
adminRoute.get('/users/:id/logs', (c) => {
  const id = Number(c.req.param('id'))
  const logs = db.prepare(`
    SELECT id, created_at, experiment_number, experiment_title, input_tokens, output_tokens, input_json, report_json
    FROM usage_logs WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 100
  `).all(id) as {
    id: number; created_at: number; experiment_number: string
    experiment_title: string; input_tokens: number; output_tokens: number
    input_json: string; report_json: string
  }[]
  return c.json({ ok: true, logs })
})
