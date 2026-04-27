import { useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { GeneratedReport, ContentBlock } from '../api/client'

const HISTORY_KEY = 'ra_history'

export interface HistoryEntry {
  id: string
  date: string
  experimentNumber: string
  experimentTitle: string
  report: GeneratedReport
}

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
  } catch { return [] }
}

function deleteHistory(id: string) {
  const entries = loadHistory().filter(e => e.id !== id)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries))
}

function FormulaRender({ latex }: { latex: string }) {
  try {
    const html = katex.renderToString(latex, { throwOnError: false, displayMode: true })
    return <span dangerouslySetInnerHTML={{ __html: html }} />
  } catch {
    return <span className="formula-latex">{latex}</span>
  }
}

function BlockPreview({ block, workImageUrls }: { block: ContentBlock; workImageUrls: string[][] }) {
  if (block.type === 'paragraph') {
    return <p className="preview-text">{block.text}</p>
  }
  if (block.type === 'formula') {
    return (
      <div className="preview-formula">
        <div className="formula-render"><FormulaRender latex={block.latex} /></div>
        <span className="formula-num">({block.number})</span>
      </div>
    )
  }
  if (block.type === 'image') {
    const url = workImageUrls[block.workIndex]?.[block.imageIndex]
    return (
      <div className="preview-image-block">
        {url
          ? <img src={url} alt={block.caption} className="preview-image" />
          : <div className="preview-image-placeholder">📷</div>
        }
        <p className="preview-image-caption">{block.caption}</p>
      </div>
    )
  }
  if (block.type === 'table') {
    return (
      <div className="preview-table-block">
        <p className="preview-text" style={{ textAlign: 'center', fontWeight: 500 }}>{block.caption}</p>
        <table className="preview-table">
          <thead>
            <tr>{block.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return null
}

function Section({ title, blocks, workImageUrls }: { title: string; blocks: ContentBlock[]; workImageUrls: string[][] }) {
  return (
    <div className="result-section">
      <h3>{title}</h3>
      <div className="preview-content">
        {blocks.map((b, i) => <BlockPreview key={i} block={b} workImageUrls={workImageUrls} />)}
      </div>
    </div>
  )
}

interface Props {
  report: GeneratedReport
  workImageUrls: string[][]
  onExport: () => void
  exportError: string
  onRegenerate: () => void
  onBack: () => void
  loading: boolean
}

export default function ResultStep({ report, workImageUrls, onExport, exportError, onRegenerate, onBack, loading }: Props) {
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [previewEntry, setPreviewEntry] = useState<HistoryEntry | null>(null)

  function handleDelete(id: string) {
    deleteHistory(id)
    setHistory(loadHistory())
    if (previewEntry?.id === id) setPreviewEntry(null)
  }

  const displayReport = previewEntry?.report ?? report
  // History entries don't have image URLs — show placeholders
  const displayUrls = previewEntry ? [] : workImageUrls

  return (
    <div className="step-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2>{previewEntry ? `歷史：${previewEntry.experimentTitle || '(無標題)'}` : '生成結果'}</h2>
        <button
          className="btn-secondary"
          style={{ fontSize: 12, padding: '4px 12px' }}
          onClick={() => { setShowHistory(!showHistory); setPreviewEntry(null) }}
        >
          {showHistory ? '← 返回結果' : `歷史記錄 (${history.length})`}
        </button>
      </div>

      {showHistory && !previewEntry ? (
        <div className="history-panel">
          {history.length === 0 ? (
            <p className="hint" style={{ padding: '16px 0' }}>尚無歷史記錄</p>
          ) : (
            history.map(entry => (
              <div key={entry.id} className="history-entry">
                <div className="history-entry-info">
                  <span className="history-entry-title">
                    {[entry.experimentNumber, entry.experimentTitle].filter(Boolean).join(' ') || '(未命名)'}
                  </span>
                  <span className="history-entry-date">
                    {new Date(entry.date).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }}
                    onClick={() => { setPreviewEntry(entry); setShowHistory(false) }}>
                    查看
                  </button>
                  <button className="btn-remove" style={{ fontSize: 12 }}
                    onClick={() => handleDelete(entry.id)}>
                    刪除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {!previewEntry && (
            <p className="hint">圖片為預覽用；公式以 Word 方程式格式輸出</p>
          )}

          <Section title="數據分析" blocks={displayReport.dataAnalysis} workImageUrls={displayUrls} />
          <Section title="實驗誤差" blocks={displayReport.experimentalErrors} workImageUrls={displayUrls} />
          <Section title="問題討論" blocks={displayReport.problemDiscussion} workImageUrls={displayUrls} />

          <div className="actions">
            {previewEntry ? (
              <button className="btn-secondary" onClick={() => setPreviewEntry(null)}>← 返回目前結果</button>
            ) : (
              <>
                <button className="btn-secondary" onClick={onBack} disabled={loading}>重新編輯</button>
                <button className="btn-secondary" onClick={onRegenerate} disabled={loading}>
                  {loading ? '生成中...' : '↻ 重新生成'}
                </button>
              </>
            )}
            {!previewEntry && (
              <div className="export-group">
                {exportError && (
                  <span className="export-error">{exportError}</span>
                )}
                <button className="btn-primary" onClick={onExport} disabled={loading}>
                  {loading ? '處理中...' : '下載 Word'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
