import { Hono } from 'hono'
import { generateReport } from '../services/claude'
import type { FigureData } from '../services/claude'
import type { AppEnv } from '../types'
import db from '../db'

export const generateRoute = new Hono<AppEnv>()

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

function getWeekStart(): number {
  // Monday 00:00 Taiwan time (UTC+8) = Sunday 16:00 UTC
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const taiwan = new Date(utc + 8 * 3600000)
  const day = taiwan.getDay() // 0=Sun, 1=Mon, ...
  const daysSinceMonday = day === 0 ? 6 : day - 1
  taiwan.setHours(0, 0, 0, 0)
  taiwan.setDate(taiwan.getDate() - daysSinceMonday)
  return Math.floor((taiwan.getTime() - 8 * 3600000) / 1000) // back to UTC unix
}

function buildInputLog(input: Awaited<ReturnType<typeof buildInput>>): string {
  const { studentInfo, experimentNumber, experimentTitle, figureData, questionList, discussionAnswers } = input
  return JSON.stringify({ studentInfo, experimentNumber, experimentTitle, figureData, questionList, discussionAnswers })
}

function logUsage(
  userId: number,
  experimentNumber: string,
  experimentTitle: string,
  inputTokens: number,
  outputTokens: number,
  inputJson: string,
  report: object,
) {
  try {
    db.prepare(`
      INSERT INTO usage_logs (user_id, experiment_number, experiment_title, input_tokens, output_tokens, input_json, report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, experimentNumber, experimentTitle, inputTokens, outputTokens, inputJson, JSON.stringify(report))
  } catch (e) {
    console.error('[generate] log error:', e)
  }
}

function checkWeeklyLimit(userId: number): { ok: boolean; used: number; limit: number } {
  const user = db.prepare('SELECT weekly_limit FROM users WHERE id = ?').get(userId) as { weekly_limit: number } | null
  const limit = user?.weekly_limit ?? -1
  if (limit === -1) return { ok: true, used: 0, limit }
  const weekStart = getWeekStart()
  const row = db.prepare('SELECT COUNT(*) as cnt FROM usage_logs WHERE user_id = ? AND created_at >= ?').get(userId, weekStart) as { cnt: number }
  return { ok: row.cnt < limit, used: row.cnt, limit }
}

async function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  const buf = await file.arrayBuffer()
  return {
    base64: Buffer.from(buf).toString('base64'),
    mediaType: file.type || 'image/jpeg',
  }
}

function parseNum(s: string): number {
  return parseFloat(s.replace(/[^0-9.-]/g, '')) || 0
}

type BodyValue = string | File | (string | File)[]

async function buildInput(body: Record<string, BodyValue>) {
  const studentInfo = {
    name1: String(body.name1 || ''),
    name2: String(body.name2 || ''),
    studentId1: String(body.studentId1 || ''),
    studentId2: String(body.studentId2 || ''),
    department: String(body.department || ''),
    group: String(body.group || ''),
    experimentDate: String(body.experimentDate || ''),
    submitDate: String(body.submitDate || ''),
    instructor: String(body.instructor || ''),
  }

  const labFiles = Array.isArray(body.labRecordImages)
    ? body.labRecordImages
    : body.labRecordImages ? [body.labRecordImages] : []
  const labRecordImages = await Promise.all(
    labFiles.filter((f) => f instanceof File).map((f) => fileToBase64(f as File))
  )

  const workCount = Number(body.workCount || 0)
  const works: Array<{ label: string; images: Array<{ base64: string; mediaType: string }> }> = []
  const figureData: FigureData[] = []

  for (let wi = 0; wi < workCount; wi++) {
    const workLabel = String(body[`work_${wi}_label`] || `工作${wi + 1}`)

    // Dense images array (only uploaded figures, in figureIndex order)
    const rawFiles = body[`work_${wi}_images`]
    const files: (string | File)[] = Array.isArray(rawFiles)
      ? (rawFiles as (string | File)[])
      : rawFiles ? [rawFiles as string | File] : []
    const images = await Promise.all(
      files.filter((f): f is File => f instanceof File).map(fileToBase64)
    )
    works.push({ label: workLabel, images })

    // Mapping: which figureIndices have uploaded images (in upload order = imageIndex order)
    const figIndicesRaw = String(body[`work_${wi}_fig_indices`] || '')
    const uploadedFigIndices = figIndicesRaw.length > 0
      ? figIndicesRaw.split(',').map(Number).filter(n => !isNaN(n))
      : []

    // figureIndex → imageIndex (position in dense images array)
    const figToImgIdx: Record<number, number> = {}
    uploadedFigIndices.forEach((fi, idx) => { figToImgIdx[fi] = idx })

    const figCount = Number(body[`work_${wi}_fig_count`] || 0)
    for (let fi = 0; fi < figCount; fi++) {
      const vout = String(body[`w${wi}_f${fi}_vout`] || '')
      const vin  = String(body[`w${wi}_f${fi}_vin`]  || '')
      const atheory = String(body[`w${wi}_f${fi}_atheory`] || '')

      if (!vout && !vin && !atheory) continue

      const voutNum = parseNum(vout)
      const vinNum  = parseNum(vin) || 1
      const atheoryNum = parseNum(atheory)

      const aactual  = Math.round((voutNum / vinNum) * 1000) / 1000
      const errorPct = atheoryNum !== 0
        ? Math.round(Math.abs((atheoryNum - aactual) / atheoryNum) * 1000) / 10
        : 0

      const imageIndex = figToImgIdx[fi] ?? -1

      figureData.push({ workIndex: wi, workLabel, figureIndex: fi, imageIndex, vout, vin, atheory, aactual, errorPct })
    }
  }

  return {
    experimentNumber: String(body.experimentNumber || ''),
    experimentTitle: String(body.experimentTitle || ''),
    studentInfo,
    labRecordImages,
    works,
    figureData,
    questionList: String(body.questionList || ''),
    discussionAnswers: String(body.discussionAnswers || ''),
  }
}

// ── Regular (non-streaming) route ────────────────────────────────────────────

generateRoute.post('/', async (c) => {
  const body = await c.req.parseBody({ all: true })
  const userId = c.get('userId')

  if (userId) {
    const { ok, used, limit } = checkWeeklyLimit(userId)
    if (!ok) return c.json({ ok: false, error: `本週使用次數已達上限（${used}/${limit}）` }, 429)
  }

  try {
    const input = await buildInput(body as Record<string, BodyValue>)
    const inputJson = buildInputLog(input)
    const inputTokens = estimateTokens(inputJson)
    const report = await generateReport(input)
    const outputTokens = estimateTokens(JSON.stringify(report))
    if (userId) logUsage(userId, input.experimentNumber, input.experimentTitle, inputTokens, outputTokens, inputJson, report)
    return c.json({ ok: true, report })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[generate] ERROR:', msg)
    return c.json({ ok: false, error: msg }, 500)
  }
})

// ── Streaming SSE route ───────────────────────────────────────────────────────

generateRoute.post('/stream', async (c) => {
  const body = await c.req.parseBody({ all: true })
  const userId = c.get('userId')

  if (userId) {
    const { ok, used, limit } = checkWeeklyLimit(userId)
    if (!ok) return c.json({ ok: false, error: `本週使用次數已達上限（${used}/${limit}）` }, 429)
  }

  let input: Awaited<ReturnType<typeof buildInput>>

  try {
    input = await buildInput(body as Record<string, BodyValue>)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 400)
  }

  const enc = new TextEncoder()
  let ctrl!: ReadableStreamDefaultController<Uint8Array>

  const readable = new ReadableStream<Uint8Array>({
    start(controller) { ctrl = controller },
  })

  const send = (event: string, data: unknown) => {
    try {
      ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
    } catch { /* stream closed */ }
  }

  ;(async () => {
    const keepalive = setInterval(() => {
      try { ctrl.enqueue(enc.encode(': keepalive\n\n')) } catch { clearInterval(keepalive) }
    }, 5_000)

    try {
      send('status', { msg: '呼叫 AI 服務中...' })

      // Proxy-cli streaming endpoint returns empty immediately; use non-streaming to avoid
      // SSE connection drops. Keepalive above keeps the connection alive while waiting.
      const report = await generateReport(input)

      if (userId) {
        const inputJson = buildInputLog(input)
        const inputTokens = estimateTokens(inputJson)
        const outputTokens = estimateTokens(JSON.stringify(report))
        logUsage(userId, input.experimentNumber, input.experimentTitle, inputTokens, outputTokens, inputJson, report)
      }

      send('done', { report })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[generate/stream] ERROR:', msg)
      send('error', { msg })
    } finally {
      clearInterval(keepalive)
      try { ctrl.close() } catch { /* already closed */ }
    }
  })()

  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173'
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': corsOrigin,
    },
  })
})
