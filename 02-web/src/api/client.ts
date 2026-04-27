const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001'

export interface StudentInfo {
  name1: string; name2: string
  studentId1: string; studentId2: string
  department: string; group: string
  experimentDate: string; submitDate: string; instructor: string
}

export type ContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'formula'; latex: string; number: number; label?: string }
  | { type: 'image'; workIndex: number; imageIndex: number; caption: string; figureNumber: number }
  | { type: 'table'; caption: string; headers: string[]; rows: string[][] }

export interface GeneratedReport {
  dataAnalysis: ContentBlock[]
  experimentalErrors: ContentBlock[]
  problemDiscussion: ContentBlock[]
}

export type StreamEvent =
  | { type: 'status'; msg: string }
  | { type: 'chunk'; text: string }
  | { type: 'done'; report: GeneratedReport }
  | { type: 'error'; msg: string }

// ── Generate report (regular POST) ──────────────────────────────────────────

export async function generateReport(formData: FormData): Promise<GeneratedReport> {
  const res = await fetch(`${BASE}/api/generate`, { method: 'POST', body: formData })
  const data = await res.json() as { ok: boolean; report?: GeneratedReport; error?: string }
  if (!res.ok || !data.ok) throw new Error(data.error ?? `生成失敗: ${res.status}`)
  return data.report!
}

// ── Generate report (SSE streaming) ─────────────────────────────────────────

export async function generateReportStream(
  formData: FormData,
  onStatus: (msg: string) => void,
  onChunk: (chars: number) => void,
): Promise<GeneratedReport> {
  const res = await fetch(`${BASE}/api/generate/stream`, { method: 'POST', body: formData })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''
  let totalChars = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6)) as Record<string, unknown>
          if (currentEvent === 'status') onStatus(data.msg as string)
          else if (currentEvent === 'chunk') {
            totalChars += (data.text as string).length
            onChunk(totalChars)
          } else if (currentEvent === 'done') return data.report as GeneratedReport
          else if (currentEvent === 'error') throw new Error(data.msg as string)
        } catch (e) {
          if (e instanceof SyntaxError) continue
          throw e
        }
        currentEvent = ''
      }
    }
  }
  throw new Error('串流意外結束')
}

// ── Export to docx ───────────────────────────────────────────────────────────

export interface ExportInput {
  studentInfo: StudentInfo
  experimentNumber: string
  experimentTitle: string
  works: Array<{ images: File[] }>
}

export async function exportDocx(input: ExportInput, report: GeneratedReport): Promise<Blob> {
  const fd = new FormData()
  fd.append('experimentNumber', input.experimentNumber)
  fd.append('experimentTitle', input.experimentTitle)
  Object.entries(input.studentInfo).forEach(([k, v]) => fd.append(k, v))
  fd.append('report', JSON.stringify(report))
  fd.append('workCount', String(input.works.length))
  input.works.forEach((work, i) => {
    work.images.forEach((img) => fd.append(`work_${i}_images`, img))
  })

  const res = await fetch(`${BASE}/api/export`, { method: 'POST', body: fd })
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { error?: string } | null
    throw new Error(data?.error ?? `匯出失敗: ${res.status}`)
  }
  return res.blob()
}
