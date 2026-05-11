import { Hono } from 'hono'
import { buildDocx } from '../services/docxGenerator'
import type { ContentBlock } from '../services/claude'

export const exportRoute = new Hono()

exportRoute.post('/', async (c) => {
  try {
    const body = await c.req.parseBody({ all: true })

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
    const experimentNumber = String(body.experimentNumber || '')
    const experimentTitle = String(body.experimentTitle || '')
    const report = JSON.parse(String(body.report)) as {
      dataAnalysis: ContentBlock[]
      experimentalErrors: ContentBlock[]
      problemDiscussion: ContentBlock[]
    }
    const workCount = Number(body.workCount || 0)

    // Parse lab record scan images
    const rawLabScans = body['labRecordImages']
    const labScanFiles: (string | File)[] = Array.isArray(rawLabScans)
      ? (rawLabScans as (string | File)[])
      : rawLabScans ? [rawLabScans as string | File] : []
    const labRecordImages: Array<{ buffer: Buffer; mime: string }> = []
    for (const f of labScanFiles) {
      if (f instanceof File) {
        labRecordImages.push({ buffer: Buffer.from(await f.arrayBuffer()), mime: f.type || 'image/jpeg' })
      }
    }

    // Build workImageMap[workIndex][imageIndex] = { buffer, mime }
    const workImageMap: Array<Array<{ buffer: Buffer; mime: string }>> = []
    for (let i = 0; i < workCount; i++) {
      const raw = body[`work_${i}_images`]
      const files: (string | File)[] = Array.isArray(raw)
        ? (raw as (string | File)[])
        : raw ? [raw as string | File] : []

      const images: Array<{ buffer: Buffer; mime: string }> = []
      for (const f of files) {
        if (f instanceof File) {
          const buf = Buffer.from(await f.arrayBuffer())
          images.push({ buffer: buf, mime: f.type || 'image/jpeg' })
        }
      }
      workImageMap.push(images)
    }

    const buffer = await buildDocx({ studentInfo, experimentNumber, experimentTitle }, report, workImageMap, labRecordImages)
    const filename = [experimentNumber, experimentTitle].filter(Boolean).join(' ')

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.docx"`,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[export] ERROR:', msg)
    return c.json({ ok: false, error: msg }, 500)
  }
})
