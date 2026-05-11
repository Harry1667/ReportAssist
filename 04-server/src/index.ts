import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { bodyLimit } from 'hono/body-limit'
import { generateRoute } from './routes/generate'
import { exportRoute } from './routes/export'
import { authRoute } from './routes/auth'
import { adminRoute } from './routes/admin'
import { requireAuth } from './middleware/requireAuth'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173'
app.use('*', cors({ origin: corsOrigin }))
app.use('*', logger())
app.use('*', bodyLimit({ maxSize: 50 * 1024 * 1024 }))  // 50 MB

app.get('/health', (c) => c.json({ ok: true }))

// Public auth routes
app.route('/api/auth', authRoute)

// Protected routes — use wildcard without leading slash so bare paths match too
app.use('/api/generate*', requireAuth)
app.use('/api/export*', requireAuth)
app.use('/api/admin*', requireAuth)

app.route('/api/generate', generateRoute)
app.route('/api/export', exportRoute)
app.route('/api/admin', adminRoute)

const port = Number(process.env.PORT) || 3001
console.log(`Server running on http://localhost:${port}`)

export default {
  port,
  fetch: app.fetch,
}
