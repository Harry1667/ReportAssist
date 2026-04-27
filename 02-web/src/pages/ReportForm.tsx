import { useEffect, useState } from 'react'
import { generateReport, exportDocx } from '../api/client'
import { compressImage } from '../utils/compressImage'
import type { GeneratedReport, StudentInfo } from '../api/client'
import type { HistoryEntry } from '../components/ResultStep'
import StudentInfoStep from '../components/StudentInfoStep'
import ImageUploadStep from '../components/ImageUploadStep'
import ContentStep from '../components/ContentStep'
import ResultStep from '../components/ResultStep'

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
  workValues: {
    'w0_f0_vout': '158mV', 'w0_f0_vin': '229mV', 'w0_f0_atheory': '-0.56',
    'w1_f0_vout': '263mV', 'w1_f0_vin': '225mV', 'w1_f0_atheory': '-1.09',
    'w1_f1_vout': '257mV', 'w1_f1_vin': '251mV', 'w1_f1_atheory': '1.13',
    'w1_f2_vout': '760mV', 'w1_f2_vin': '240mV', 'w1_f2_atheory': '3.55',
  },
  questionList: '問題一、請問對於減法電路而言不同的交流訊號是否可以相減?\n問題二、請問一直流電壓與正弦波訊號相減，若以示波器ＡＣ檔位觀察其輸出波型，則直流電壓的改變對於輸出波型的觀測有何影響？',
  discussionAnswers: '',
}

// ── localStorage keys ────────────────────────────────────────────────────────
const FORM_KEY    = 'ra_form'
const HISTORY_KEY = 'ra_history'

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

function loadInitialForm(): FormState {
  try {
    const raw = localStorage.getItem(FORM_KEY)
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

function saveToHistory(report: GeneratedReport, title: string, number: string) {
  try {
    const existing: HistoryEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      experimentNumber: number,
      experimentTitle: title,
      report,
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...existing].slice(0, 20)))
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
  const [step, setStep] = useState<Step>('info')
  const [form, setForm] = useState<FormState>(loadInitialForm)
  const [report, setReport] = useState<GeneratedReport | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState('')

  const currentIndex = STEPS.indexOf(step)

  // Debounced localStorage save (skips File objects automatically)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(FORM_KEY, JSON.stringify(formToSaveable(form)))
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

  async function handleGenerate() {
    setLoading(true)
    setLoadingMsg('壓縮圖片中...')
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

      setLoadingMsg('AI 生成中，約需 30~90 秒...')
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

      const result = await generateReport(fd)
      setReport(result)
      saveToHistory(result, form.experimentTitle, form.experimentNumber)
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
    setError('')
    try {
      const blob = await exportDocx(
        {
          studentInfo: form.studentInfo,
          experimentNumber: form.experimentNumber,
          experimentTitle: form.experimentTitle,
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
      setError(e instanceof Error ? e.message : '匯出失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1>AI 實驗報告助手</h1>

      {loadingMsg && (
        <div className="loading-overlay">
          <span className="loading-spinner" />
          <span>{loadingMsg}</span>
        </div>
      )}

      <div className="steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`step-item ${i <= currentIndex ? 'active' : ''}`}>
            <span className="step-num">{i + 1}</span>
            <span className="step-label">{STEP_LABELS[s]}</span>
          </div>
        ))}
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
          onExport={handleExport}
          onBack={() => setStep('content')}
          loading={loading}
        />
      )}
    </div>
  )
}
