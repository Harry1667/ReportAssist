import { verify } from 'hono/jwt'
import type { Context, Next } from 'hono'
import type { AppEnv } from '../types'
import db from '../db'

type Ctx = Context<AppEnv>

async function resolveUser(c: Ctx): Promise<boolean> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  try {
    const secret = process.env.JWT_SECRET ?? 'dev-secret-change-me'
    const payload = await verify(authHeader.slice(7), secret, 'HS256') as { sub: number }
    const user = db.prepare(
      'SELECT id, username, role, status FROM users WHERE id = ?'
    ).get(payload.sub) as { id: number; username: string; role: string; status: string } | null
    if (!user || user.status !== 'approved') return false
    c.set('userId', user.id)
    c.set('userRole', user.role)
    c.set('username', user.username)
    return true
  } catch {
    return false
  }
}

export async function requireAuth(c: Ctx, next: Next) {
  const ok = await resolveUser(c)
  if (!ok) return c.json({ ok: false, error: '未授權，請重新登入' }, 401)
  await next()
}

export async function requireAdmin(c: Ctx, next: Next) {
  const ok = await resolveUser(c)
  if (!ok) return c.json({ ok: false, error: '未授權，請重新登入' }, 401)
  if (c.get('userRole') !== 'admin') return c.json({ ok: false, error: '需要管理員權限' }, 403)
  await next()
}
