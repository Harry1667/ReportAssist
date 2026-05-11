import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { generateReportStream, exportDocx } from '../api/client'
import { compressImage } from '../utils/compressImage'
import type { GeneratedReport, StudentInfo } from '../api/client'
import type { HistoryEntry } from '../components/ResultStep'
import StudentInfoStep from '../components/StudentInfoStep'
import ImageUploadStep from '../components/ImageUploadStep'
import ContentStep from '../components/ContentStep'
import ResultStep from '../components/ResultStep'
import { useAuth } from '../context/AuthContext'

const BASE = import.meta.env.VITE_API_BASE ?? ''

// ── Profile Modal ─────────────────────────────────────────────────────────────
function ProfileModal({ token, username, onClose, onUpdated }: {
  token: string; username: string; onClose: () => void; onUpdated: (u: string) => void
}) {
  const [newUsername, setNewUsername] = useState(username)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (newPw && newPw !== confirmPw) { setError('新密碼不一致'); return }
    setLoading(true)
    try {
      const body: Record<string, string> = { currentPassword: currentPw }
      if (newUsername.trim() !== username) body.username = newUsername.trim()
      if (newPw) body.password = newPw
      const res = await fetch(`${BASE}/api/auth/profile`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { ok: boolean; error?: string; user?: { username: string } }
      if (!data.ok) { setError(data.error ?? '更新失敗'); return }
      setSuccess('已儲存'); setCurrentPw(''); setNewPw(''); setConfirmPw('')
      if (data.user) onUpdated(data.user.username)
    } catch { setError('網路錯誤') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: 10, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>個人設置</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>×</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {error && <div className="error">{error}</div>}
          {success && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#15803d', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{success}</div>}
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>用戶名</label>
              <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} />
            </div>
            <div className="field">
              <label>目前密碼 <span style={{ fontWeight: 400, color: '#9ca3af' }}>（必填）</span></label>
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="輸入目前密碼以確認身分" />
            </div>
            <div className="field">
              <label>新密碼 <span style={{ fontWeight: 400, color: '#9ca3af' }}>（留空不更改）</span></label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="至少 6 個字元" />
            </div>
            {newPw && (
              <div className="field">
                <label>確認新密碼</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="submit" className="btn-primary" disabled={loading || !currentPw} style={{ flex: 1 }}>
                {loading ? '儲存中...' : '儲存'}
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export type Step = 'info' | 'images' | 'content' | 'result'

export interface WorkFigure {
  image: File | null
}

export interface WorkImages {
  label: string
  figures: WorkFigure[]
}

export interface FormState {
  experimentNumber: string
  experimentTitle: string
  studentInfo: StudentInfo
  labRecordImages: File[]
  works: WorkImages[]
  workValues: Record<string, string>
  questionList: string
  discussionAnswers: string
}

export interface AnalysisResult {
  works: Array<{
    workIndex: number
    label: string
    fields: Array<{ key: string; label: string; unit?: string }>
  }>
}

const INITIAL: FormState = {
  experimentNumber: '',
  experimentTitle: '',
  studentInfo: {
    name1: '', name2: '',
    studentId1: '', studentId2: '',
    department: '', group: '',
    experimentDate: '', submitDate: '', instructor: '',
  },
  labRecordImages: [],
  works: [
    { label: '工作一', figures: [{ image: null }] },
    { label: '工作二', figures: [{ image: null }, { image: null }, { image: null }] },
  ],
  workValues: {},
  questionList: '',
  discussionAnswers: '',
}

// ── localStorage keys ────────────────────────────────────────────────────────
const formKey    = (uid: number) => `ra_form_${uid}`
const historyKey = (uid: number) => `ra_history_${uid}`

interface SaveableFormState {
  experimentNumber: string
  experimentTitle: string
  studentInfo: StudentInfo
  worksMeta: Array<{ label: string; figureCount: number }>
  workValues: Record<string, string>
  questionList: string
  discussionAnswers: string
}

function formToSaveable(form: FormState): SaveableFormState {
  return {
    experimentNumber: form.experimentNumber,
    experimentTitle: form.experimentTitle,
    studentInfo: { ...form.studentInfo },
    worksMeta: form.works.map(w => ({ label: w.label, figureCount: w.figures.length })),
    workValues: { ...form.workValues },
    questionList: form.questionList,
    discussionAnswers: form.discussionAnswers,
  }
}

function loadInitialForm(uid: number): FormState {
  try {
    const raw = localStorage.getItem(formKey(uid))
    if (!raw) return INITIAL
    const saved = JSON.parse(raw) as Partial<SaveableFormState>
    return {
      ...INITIAL,
      experimentNumber: saved.experimentNumber ?? INITIAL.experimentNumber,
      experimentTitle:  saved.experimentTitle  ?? INITIAL.experimentTitle,
      studentInfo: { ...INITIAL.studentInfo, ...(saved.studentInfo ?? {}) },
      works: saved.worksMeta?.map(m => ({
        label: m.label,
        figures: Array.from({ length: m.figureCount }, () => ({ image: null })),
      })) ?? INITIAL.works,
      workValues: { ...INITIAL.workValues, ...(saved.workValues ?? {}) },
      questionList:     saved.questionList     ?? INITIAL.questionList,
      discussionAnswers: saved.discussionAnswers ?? INITIAL.discussionAnswers,
    }
  } catch {
    return INITIAL
  }
}

function saveToHistory(uid: number, report: GeneratedReport, title: string, number: string) {
  try {
    const existing: HistoryEntry[] = JSON.parse(localStorage.getItem(historyKey(uid)) ?? '[]')
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      experimentNumber: number,
      experimentTitle: title,
      report,
    }
    localStorage.setItem(historyKey(uid), JSON.stringify([entry, ...existing].slice(0, 20)))
  } catch { /* ignore storage errors */ }
}

// ── Steps ────────────────────────────────────────────────────────────────────
const STEPS: Step[] = ['info', 'images', 'content', 'result']
const STEP_LABELS: Record<Step, string> = {
  info: '學生資訊',
  images: '上傳圖片',
  content: '問題討論',
  result: '生成結果',
}

export default function ReportForm() {
  const { token, user, logout } = useAuth()
  const navigate = useNavigate()
  const [showProfile, setShowProfile] = useState(false)
  const [displayName, setDisplayName] = useState(user?.username ?? '')
  const [step, setStep] = useState<Step>('info')
  const [form, setForm] = useState<FormState>(() => loadInitialForm(user?.id ?? 0))
  const [report, setReport] = useState<GeneratedReport | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [streamChars, setStreamChars] = useState(0)
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')
  const [workImageUrls, setWorkImageUrls] = useState<string[][]>([])
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null)

  const fetchUsage = useCallback(() => {
    if (!token) return
    fetch(`${BASE}/api/auth/usage`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: { ok: boolean; used?: number; limit?: number }) => {
        if (d.ok) setUsage({ used: d.used!, limit: d.limit! })
      })
      .catch(() => {})
  }, [token])

  useEffect(() => { fetchUsage() }, [fetchUsage])

  const currentIndex = STEPS.indexOf(step)

  // Debounced localStorage save (skips File objects automatically)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(formKey(user?.id ?? 0), JSON.stringify(formToSaveable(form)))
      } catch { /* ignore */ }
    }, 800)
    return () => clearTimeout(timer)
  }, [form])

  function handleImagesNext() {
    const syntheticAnalysis: AnalysisResult = {
      works: form.works
        .map((work, wi) => ({
          workIndex: wi,
          label: work.label,
          fields: work.figures.flatMap((_, fi) => [
            { key: `w${wi}_f${fi}_vout`, label: `Figure ${fi + 1} V_out（實測）`, unit: 'mV' },
            { key: `w${wi}_f${fi}_vin`,  label: `Figure ${fi + 1} V_in（實測）`,  unit: 'mV' },
            { key: `w${wi}_f${fi}_atheory`, label: `Figure ${fi + 1} 理論增益 A_th` },
          ]),
        }))
        .filter(w => w.fields.length > 0),
    }
    setAnalysis(syntheticAnalysis.works.length > 0 ? syntheticAnalysis : null)
    setStep('content')
  }

  function handleReset() {
    if (!confirm('確定要清空所有資料重新開始嗎？')) return
    workImageUrls.flat().forEach(u => URL.revokeObjectURL(u))
    setWorkImageUrls([])
    localStorage.removeItem(formKey(user?.id ?? 0))
    setForm(INITIAL)
    setReport(null)
    setAnalysis(null)
    setError('')
    setStep('info')
  }

  async function handleGenerate() {
    setLoading(true)
    setLoadingMsg('壓縮圖片中...')
    setStreamChars(0)
    setError('')
    try {
      const compressedLabImages = await Promise.all(form.labRecordImages.map(f => compressImage(f)))
      const compressedWorks = await Promise.all(
        form.works.map(async (work) => ({
          ...work,
          figures: await Promise.all(
            work.figures.map(async (fig) => ({
              image: fig.image ? await compressImage(fig.image) : null,
            }))
          ),
        }))
      )

      // Build object URLs for result preview
      const newUrls = compressedWorks.map(work =>
        work.figures
          .filter(f => f.image !== null)
          .map(f => URL.createObjectURL(f.image!))
      )
      workImageUrls.flat().forEach(u => URL.revokeObjectURL(u))
      setWorkImageUrls(newUrls)

      setLoadingMsg('AI 生成中...')
      const fd = new FormData()
      fd.append('experimentNumber', form.experimentNumber)
      fd.append('experimentTitle', form.experimentTitle)
      Object.entries(form.studentInfo).forEach(([k, v]) => fd.append(k, v))

      compressedLabImages.forEach((f) => fd.append('labRecordImages', f))

      compressedWorks.forEach((work, i) => {
        // Dense images array (in figureIndex order, skipping nulls)
        work.figures.forEach((fig) => { if (fig.image) fd.append(`work_${i}_images`, fig.image) })
        fd.append(`work_${i}_label`, work.label)
        fd.append(`work_${i}_fig_count`, String(work.figures.length))
        // Mapping: which figureIndices have images (for correct imageIndex alignment)
        const figIndices = work.figures
          .map((fig, fi) => (fig.image ? fi : -1))
          .filter(fi => fi >= 0)
        fd.append(`work_${i}_fig_indices`, figIndices.join(','))
      })
      fd.append('workCount', String(form.works.length))

      Object.entries(form.workValues).forEach(([k, v]) => fd.append(k, v))
      fd.append('questionList', form.questionList)
      fd.append('discussionAnswers', form.discussionAnswers)

      const result = await generateReportStream(
        fd,
        (msg) => setLoadingMsg(msg),
        (chars) => { setStreamChars(chars); setLoadingMsg(`AI 生成中... ${chars} 字元`) },
      )
      setReport(result)
      saveToHistory(user?.id ?? 0, result, form.experimentTitle, form.experimentNumber)
      fetchUsage()
      setStep('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失敗，請重試')
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  async function handleExport() {
    if (!report) return
    setLoading(true)
    setExportError('')
    try {
      const blob = await exportDocx(
        {
          studentInfo: form.studentInfo,
          experimentNumber: form.experimentNumber,
          experimentTitle: form.experimentTitle,
          labRecordImages: form.labRecordImages,
          works: form.works.map((w) => ({ images: w.figures.flatMap(f => f.image ? [f.image] : []) })),
        },
        report
      )
      const filename = [form.experimentNumber, form.experimentTitle].filter(Boolean).join(' ')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : '匯出失敗')
    } finally {
      setLoading(false)
    }
  }

  const usageBadge = usage && (
    <span style={{
      fontSize: 12, padding: '3px 10px', borderRadius: 12,
      background: usage.limit !== -1 && usage.used >= usage.limit ? '#fee2e2' : '#f0f9ff',
      color: usage.limit !== -1 && usage.used >= usage.limit ? '#dc2626' : '#2563eb',
      border: `1px solid ${usage.limit !== -1 && usage.used >= usage.limit ? '#fca5a5' : '#bfdbfe'}`,
    }}>
      本週：{usage.used}{usage.limit === -1 ? ' 次' : `/${usage.limit} 次`}
    </span>
  )

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>AI 實驗報告助手</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {usageBadge}
          <button onClick={() => setShowProfile(true)}
            style={{ fontSize: 13, padding: '4px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', color: '#374151', cursor: 'pointer' }}>
            {displayName || user?.username}
          </button>
          <button onClick={() => { logout(); navigate('/login') }}
            style={{ fontSize: 13, padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: 'white', color: '#9ca3af', cursor: 'pointer' }}>
            登出
          </button>
        </div>
      </div>

      {loadingMsg && (
        <div className="loading-overlay">
          <span className="loading-spinner" />
          <div className="loading-text">
            <span>{loadingMsg}</span>
            {streamChars > 0 && <span className="stream-hint">（公式與圖片下載後渲染）</span>}
          </div>
        </div>
      )}

      <div className="steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`step-item ${i <= currentIndex ? 'active' : ''}`}>
            <span className="step-num">{i + 1}</span>
            <span className="step-label">{STEP_LABELS[s]}</span>
          </div>
        ))}
        <button className="btn-reset" onClick={handleReset} title="清空所有資料重新開始">↺ 重新開始</button>
      </div>

      {error && <div className="error">{error}</div>}

      {step === 'info' && (
        <StudentInfoStep form={form} onChange={setForm} onNext={() => setStep('images')} />
      )}
      {step === 'images' && (
        <ImageUploadStep
          form={form}
          onChange={setForm}
          onBack={() => setStep('info')}
          onNext={handleImagesNext}
        />
      )}
      {step === 'content' && (
        <ContentStep
          form={form}
          onChange={setForm}
          analysis={analysis}
          onBack={() => setStep('images')}
          onGenerate={handleGenerate}
          loading={loading}
        />
      )}
      {step === 'result' && report && (
        <ResultStep
          report={report}
          workImageUrls={workImageUrls}
          onExport={handleExport}
          exportError={exportError}
          onRegenerate={handleGenerate}
          onBack={() => setStep('content')}
          loading={loading}
          userId={user?.id ?? 0}
        />
      )}

      {showProfile && token && (
        <ProfileModal
          token={token}
          username={displayName || user?.username || ''}
          onClose={() => setShowProfile(false)}
          onUpdated={name => setDisplayName(name)}
        />
      )}
    </div>
  )
}
