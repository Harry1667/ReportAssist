import { useEffect, useRef, useState } from 'react'
import type { FormState, WorkFigure } from '../pages/ReportForm'

interface Props {
  form: FormState
  onChange: (f: FormState) => void
  onBack: () => void
  onNext: () => void
}

// activeZone: "lab" | "w{wi}_f{fi}"
let activeZone = 'lab'

function setActiveZone(id: string) {
  activeZone = id
}

interface FigureSlotProps {
  zoneId: string
  figure: WorkFigure
  figIndex: number
  onFile: (file: File | null) => void
  onRemove: () => void
  isActive: boolean
  onActivate: () => void
}

function FigureSlot({ zoneId, figure, figIndex, onFile, onRemove, isActive, onActivate }: FigureSlotProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className={`figure-slot ${isActive ? 'figure-slot--active' : ''}`}
      onClick={() => { onActivate(); setActiveZone(zoneId) }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'))
        if (file) { onActivate(); onFile(file) }
      }}
    >
      <div className="figure-slot-label">Figure {figIndex + 1}</div>
      {figure.image ? (
        <div className="figure-slot-img-wrap">
          <img src={URL.createObjectURL(figure.image)} alt={`Figure ${figIndex + 1}`} />
          <button className="figure-slot-remove" onClick={(e) => { e.stopPropagation(); onFile(null) }}>✕</button>
        </div>
      ) : (
        <div className="figure-slot-empty" onClick={() => fileRef.current?.click()}>
          <span>點擊或拖放</span>
          <span className="figure-slot-paste-hint">可先點選再貼上 ⌘V</span>
        </div>
      )}
      <button
        className="figure-slot-del"
        title="刪除此 Figure"
        onClick={(e) => { e.stopPropagation(); onRemove() }}
      >✕ 刪除</button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function LabDropZone({ onFiles, isActive, onActivate }: { onFiles: (files: File[]) => void; isActive: boolean; onActivate: () => void }) {
  const ref = useRef<HTMLInputElement>(null)

  return (
    <div
      className={`upload-zone small ${isActive ? 'upload-zone--active' : ''}`}
      tabIndex={0}
      onClick={() => { onActivate(); ref.current?.click() }}
      onFocus={onActivate}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onFiles(Array.from(e.dataTransfer.files)); onActivate() }}
    >
      <span>點擊、拖曳或貼上圖片 (⌘V)</span>
      {isActive && <span className="upload-zone-active-hint">← 已選取，可直接貼上</span>}
      <input ref={ref} type="file" accept="image/*" multiple hidden
        onChange={(e) => e.target.files && onFiles(Array.from(e.target.files))} />
    </div>
  )
}

export default function ImageUploadStep({ form, onChange, onBack, onNext }: Props) {
  const [activeId, setActiveId] = useState<string>('lab')

  function activate(id: string) {
    setActiveId(id)
    setActiveZone(id)
  }

  // Global paste listener
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter((f): f is File => f !== null)
      if (files.length === 0) return

      const zone = activeZone
      if (zone === 'lab') {
        onChange({ ...form, labRecordImages: [...form.labRecordImages, ...files] })
      } else {
        const m = zone.match(/^w(\d+)_f(\d+)$/)
        if (m) {
          const wi = Number(m[1])
          const fi = Number(m[2])
          const works = form.works.map((w, i) =>
            i === wi
              ? { ...w, figures: w.figures.map((fig, j) => j === fi ? { image: files[0] } : fig) }
              : w
          )
          onChange({ ...form, works })
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [form, onChange])

  // --- 實驗紀錄書掃描 ---
  function addLabImages(files: File[]) {
    onChange({ ...form, labRecordImages: [...form.labRecordImages, ...files] })
  }
  function removeLabImage(i: number) {
    onChange({ ...form, labRecordImages: form.labRecordImages.filter((_, idx) => idx !== i) })
  }

  // --- Works ---
  function addWork() {
    const label = `工作${['一','二','三','四','五','六','七','八'][form.works.length] ?? form.works.length + 1}`
    onChange({ ...form, works: [...form.works, { label, figures: [] }] })
  }
  function removeWork(i: number) {
    onChange({ ...form, works: form.works.filter((_, idx) => idx !== i) })
  }
  function updateWorkLabel(i: number, label: string) {
    const works = form.works.map((w, idx) => idx === i ? { ...w, label } : w)
    onChange({ ...form, works })
  }
  function addFigure(wi: number) {
    const works = form.works.map((w, i) =>
      i === wi ? { ...w, figures: [...w.figures, { image: null }] } : w
    )
    onChange({ ...form, works })
  }
  function setFigureImage(wi: number, fi: number, file: File | null) {
    const works = form.works.map((w, i) =>
      i === wi
        ? { ...w, figures: w.figures.map((fig, j) => j === fi ? { image: file } : fig) }
        : w
    )
    onChange({ ...form, works })
  }
  function removeFigure(wi: number, fi: number) {
    const works = form.works.map((w, i) =>
      i === wi ? { ...w, figures: w.figures.filter((_, j) => j !== fi) } : w
    )
    onChange({ ...form, works })
  }

  return (
    <div className="step-content">
      <h2>上傳圖片</h2>

      {/* 實驗紀錄書掃描 */}
      <section className="img-section">
        <div className="img-section-header">
          <h3>實驗紀錄書掃描</h3>
          <span className="hint">手寫量測記錄頁，AI 從這裡讀取所有數據</span>
        </div>
        <LabDropZone
          onFiles={addLabImages}
          isActive={activeId === 'lab'}
          onActivate={() => activate('lab')}
        />
        {form.labRecordImages.length > 0 && (
          <div className="thumb-row">
            {form.labRecordImages.map((f, i) => (
              <div key={i} className="thumb">
                <img src={URL.createObjectURL(f)} alt={f.name} />
                <button className="btn-remove" onClick={() => removeLabImage(i)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="divider" />

      {/* Multisim 截圖（依工作 + Figure） */}
      <section className="img-section">
        <div className="img-section-header">
          <h3>Multisim 模擬截圖</h3>
          <span className="hint">每個 Figure 一張截圖，依序插入結報</span>
        </div>

        {form.works.map((work, wi) => (
          <div key={wi} className="work-block">
            <div className="work-header">
              <input
                className="work-label-input"
                value={work.label}
                onChange={(e) => updateWorkLabel(wi, e.target.value)}
              />
              <button className="btn-remove-work" onClick={() => removeWork(wi)}>移除</button>
            </div>

            <div className="figures-grid">
              {work.figures.map((fig, fi) => {
                const zid = `w${wi}_f${fi}`
                return (
                  <FigureSlot
                    key={fi}
                    zoneId={zid}
                    figure={fig}
                    figIndex={fi}
                    onFile={(f) => setFigureImage(wi, fi, f)}
                    onRemove={() => removeFigure(wi, fi)}
                    isActive={activeId === zid}
                    onActivate={() => activate(zid)}
                  />
                )
              })}
              <button className="figure-add-btn" onClick={() => addFigure(wi)}>
                ＋ Figure {work.figures.length + 1}
              </button>
            </div>
          </div>
        ))}

        <button className="btn-add-work" onClick={addWork}>＋ 新增工作</button>
      </section>

      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>上一步</button>
        <button className="btn-primary" onClick={onNext}>下一步</button>
      </div>
    </div>
  )
}
