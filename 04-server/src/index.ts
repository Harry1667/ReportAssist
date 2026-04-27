import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { bodyLimit } from 'hono/body-limit'
import { generateRoute } from './routes/generate'
import { exportRoute } from './routes/export'

const app = new Hono()

const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173'
app.use('*', cors({ origin: corsOrigin }))
app.use('*', logger())
app.use('*', bodyLimit({ maxSize: 50 * 1024 * 1024 }))  // 50 MB

app.get('/health', (c) => c.json({ ok: true }))
app.route('/api/generate', generateRoute)
app.route('/api/export', exportRoute)

const port = Number(process.env.PORT) || 3001
console.log(`Server running on http://localhost:${port}`)

export default {
  port,
  fetch: app.fetch,
}
