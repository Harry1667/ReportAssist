import { useState } from 'react'
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

function BlockPreview({ block }: { block: ContentBlock }) {
  if (block.type === 'paragraph') {
    return <p className="preview-text">{block.text}</p>
  }
  if (block.type === 'formula') {
    return (
      <div className="preview-formula">
        <span className="formula-latex">{block.latex}</span>
        <span className="formula-num">({block.number})</span>
      </div>
    )
  }
  if (block.type === 'image') {
    return (
      <div className="preview-image-block">
        <div className="preview-image-placeholder">📷 {block.caption}</div>
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

function Section({ title, blocks }: { title: string; blocks: ContentBlock[] }) {
  return (
    <div className="result-section">
      <h3>{title}</h3>
      <div className="preview-content">
        {blocks.map((b, i) => <BlockPreview key={i} block={b} />)}
      </div>
    </div>
  )
}

interface Props {
  report: GeneratedReport
  onExport: () => void
  onBack: () => void
  loading: boolean
}

export default function ResultStep({ report, onExport, onBack, loading }: Props) {
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [previewEntry, setPreviewEntry] = useState<HistoryEntry | null>(null)

  function handleDelete(id: string) {
    deleteHistory(id)
    setHistory(loadHistory())
    if (previewEntry?.id === id) setPreviewEntry(null)
  }

  const displayReport = previewEntry?.report ?? report

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
            <p className="hint">公式以 Word 方程式格式輸出，Multisim 截圖將嵌入對應位置</p>
          )}

          <Section title="數據分析" blocks={displayReport.dataAnalysis} />
          <Section title="實驗誤差" blocks={displayReport.experimentalErrors} />
          <Section title="問題討論" blocks={displayReport.problemDiscussion} />

          <div className="actions">
            {previewEntry ? (
              <button className="btn-secondary" onClick={() => setPreviewEntry(null)}>← 返回目前結果</button>
            ) : (
              <button className="btn-secondary" onClick={onBack}>重新編輯</button>
            )}
            {!previewEntry && (
              <button className="btn-primary" onClick={onExport} disabled={loading}>
                {loading ? '處理中...' : '下載 Word'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
