import type { FormState } from '../pages/ReportForm'

interface Props {
  form: FormState
  onChange: (f: FormState) => void
  onNext: () => void
}

// 接受民國或西元日期：115/04/02、115/4/2、2026/04/02、2026-04-02
const DATE_RE = /^\d{2,4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/

function validateDate(v: string): string {
  if (!v) return ''
  return DATE_RE.test(v.trim()) ? '' : '格式應為 115/04/02 或 2026/04/02'
}

function AutoInput({
  value, onValue, preset, placeholder, ...rest
}: {
  value: string
  onValue: (v: string) => void
  preset?: string
  placeholder?: string
  [k: string]: unknown
}) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab' && !value && preset) {
      e.preventDefault()
      onValue(preset)
    }
  }
  return (
    <input
      value={value}
      onChange={(e) => onValue(e.currentTarget.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder ?? preset}
      {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
    />
  )
}

export default function StudentInfoStep({ form, onChange, onNext }: Props) {
  const set = (key: keyof FormState['studentInfo'], value: string) =>
    onChange({ ...form, studentInfo: { ...form.studentInfo, [key]: value } })

  const expDateErr  = validateDate(form.studentInfo.experimentDate)
  const subDateErr  = validateDate(form.studentInfo.submitDate)

  const canNext =
    form.experimentTitle &&
    form.studentInfo.name1 &&
    form.studentInfo.studentId1 &&
    form.studentInfo.department &&
    !expDateErr && !subDateErr

  return (
    <div className="step-content">
      <h2>學生資訊</h2>

      <div className="field-row">
        <div className="field">
          <label>實驗編號</label>
          <input
            value={form.experimentNumber}
            onChange={(e) => onChange({ ...form, experimentNumber: e.target.value })}
            placeholder="例：實驗四"
          />
        </div>
        <div className="field">
          <label>實驗題目 *</label>
          <input
            value={form.experimentTitle}
            onChange={(e) => onChange({ ...form, experimentTitle: e.target.value })}
            placeholder="例：減法電路"
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>姓名 1 *</label>
          <AutoInput value={form.studentInfo.name1} onValue={(v) => set('name1', v)} placeholder="例：王小明" />
        </div>
        <div className="field">
          <label>學號 1 *</label>
          <AutoInput value={form.studentInfo.studentId1} onValue={(v) => set('studentId1', v)} placeholder="例：D1234567" />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>姓名 2</label>
          <AutoInput value={form.studentInfo.name2} onValue={(v) => set('name2', v)} placeholder="（選填）" />
        </div>
        <div className="field">
          <label>學號 2</label>
          <AutoInput value={form.studentInfo.studentId2} onValue={(v) => set('studentId2', v)} placeholder="（選填）" />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>系別 *</label>
          <AutoInput value={form.studentInfo.department} onValue={(v) => set('department', v)} placeholder="例：光電二乙" />
        </div>
        <div className="field">
          <label>組別</label>
          <AutoInput value={form.studentInfo.group} onValue={(v) => set('group', v)} placeholder="例：D3" />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>實驗日期</label>
          <input
            value={form.studentInfo.experimentDate}
            onChange={(e) => set('experimentDate', e.target.value)}
            placeholder="例：115/04/02"
            className={expDateErr ? 'input-error' : ''}
          />
          {expDateErr && <span className="field-error">{expDateErr}</span>}
        </div>
        <div className="field">
          <label>繳交日期</label>
          <input
            value={form.studentInfo.submitDate}
            onChange={(e) => set('submitDate', e.target.value)}
            placeholder="例：115/04/08"
            className={subDateErr ? 'input-error' : ''}
          />
          {subDateErr && <span className="field-error">{subDateErr}</span>}
        </div>
      </div>

      <div className="field">
        <label>指導老師</label>
        <AutoInput value={form.studentInfo.instructor} onValue={(v) => set('instructor', v)} placeholder="例：林昱志 教授" />
      </div>

      <div className="actions">
        <button className="btn-primary" onClick={onNext} disabled={!canNext}>
          下一步
        </button>
      </div>
    </div>
  )
}
