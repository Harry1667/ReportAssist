import { Hono } from 'hono'
import { generateReport } from '../services/claude'
import type { FigureData } from '../services/claude'

export const generateRoute = new Hono()

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

  try {
    const input = await buildInput(body as Record<string, BodyValue>)
    const report = await generateReport(input)
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
    }, 15_000)

    try {
      send('status', { msg: '呼叫 AI 服務中...' })

      const report = await generateReport(input, (chunk) => {
        send('chunk', { text: chunk })
      })

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
