import type { FormState, AnalysisResult } from '../pages/ReportForm'

interface Props {
  form: FormState
  onChange: (f: FormState) => void
  analysis: AnalysisResult | null
  onBack: () => void
  onGenerate: () => void
  loading: boolean
}

export default function ContentStep({ form, onChange, analysis, onBack, onGenerate, loading }: Props) {
  const setWorkValue = (key: string, value: string) =>
    onChange({ ...form, workValues: { ...form.workValues, [key]: value } })

  const canGenerate = form.questionList.trim().length > 0

  return (
    <div className="step-content">
      <h2>數值與問題</h2>

      {/* Dynamic work value fields from AI analysis */}
      {analysis && analysis.works.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p className="hint" style={{ marginBottom: 16 }}>AI 已分析學習單，請填入以下數值（用於計算增益和百分誤差）</p>
          {analysis.works.map((work) => (
            <div key={work.workIndex} className="work-block">
              <div className="work-header">
                <span style={{ fontSize: 14, fontWeight: 600 }}>{work.label}</span>
              </div>
              {work.fields.map((field) => (
                <div key={field.key} className="field" style={{ marginBottom: 10 }}>
                  <label>
                    {field.label}
                    {field.unit && <span style={{ color: '#6b7280', marginLeft: 4 }}>({field.unit})</span>}
                  </label>
                  <input
                    value={form.workValues[field.key] ?? ''}
                    onChange={(e) => setWorkValue(field.key, e.target.value)}
                    placeholder={`輸入${field.label}${field.unit ? `（${field.unit}）` : ''}`}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {!analysis && (
        <p className="hint" style={{ marginBottom: 16 }}>
          沒有上傳學習單，AI 將直接從圖片推導所需數值
        </p>
      )}

      <div className="field">
        <label>老師的問題（逐條列出）</label>
        <textarea
          rows={5}
          value={form.questionList}
          onChange={(e) => onChange({ ...form, questionList: e.target.value })}
          placeholder="1. 請問 Figure1 電路圖的輸入阻抗為何？
2. ..."
        />
      </div>

      <div className="field">
        <label>你的回答要點（可選）</label>
        <textarea
          rows={4}
          value={form.discussionAnswers}
          onChange={(e) => onChange({ ...form, discussionAnswers: e.target.value })}
          placeholder="針對上面問題，寫下你的答案要點（AI 會整理成完整論述）
若留空，AI 會根據實驗內容自行推導"
        />
      </div>

      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>上一步</button>
        <button
          className="btn-primary"
          onClick={onGenerate}
          disabled={!canGenerate || loading}
        >
          {loading ? '生成中...' : '生成報告'}
        </button>
      </div>
    </div>
  )
}
