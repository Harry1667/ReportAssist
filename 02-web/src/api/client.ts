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
