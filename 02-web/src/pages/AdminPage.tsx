import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const BASE = import.meta.env.VITE_API_BASE ?? ''

// ── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id: number; username: string; role: string; status: string
  weekly_limit: number; created_at: number; usage_count: number; total_tokens: number
}
interface LogRow {
  id: number; created_at: number; experiment_number: string
  experiment_title: string; input_tokens: number; output_tokens: number
  input_json: string; report_json: string
}
interface GlobalLogRow extends LogRow {
  user_id: number; username: string
}
interface InputLog {
  studentInfo?: { name1?: string; name2?: string; studentId1?: string; studentId2?: string; department?: string; group?: string }
  experimentNumber?: string; experimentTitle?: string
  figureData?: Array<{ workLabel?: string; figureIndex?: number; vout?: string; vin?: string; atheory?: string; aactual?: number; errorPct?: number }>
  questionList?: string; discussionAnswers?: string
}
type ContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'formula'; latex: string; number: number }
  | { type: 'image'; workIndex: number; imageIndex: number; caption: string }
  | { type: 'table'; caption: string; headers: string[]; rows: string[][] }

// ── Helpers ──────────────────────────────────────────────────────────────────

function avatarColor(name: string) {
  const colors = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#c026d3', '#65a30d']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length
  return colors[h]
}

const STATUS_LABEL: Record<string, string> = { pending: '待審核', approved: '已核准', rejected: '已停用' }
const STATUS_COLOR: Record<string, string> = { pending: '#d97706', approved: '#16a34a', rejected: '#dc2626' }
const STATUS_BG:    Record<string, string> = { pending: '#fef3c7', approved: '#dcfce7', rejected: '#fee2e2' }

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtTokens(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n === 0 ? '—' : String(n) }
function fmtLimit(n: number) { return n === -1 ? '無限制' : String(n) }

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 10, width: '100%', maxWidth: 460, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  )
}

// ── Add User Modal ────────────────────────────────────────────────────────────

function AddUserModal({ token, onClose, onDone }: { token: string; onClose: () => void; onDone: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [weeklyLimit, setWeeklyLimit] = useState('-1')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/api/admin/users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role, weekly_limit: Number(weeklyLimit) }),
      })
      const data = await res.json() as { ok: boolean; error?: string }
      if (!data.ok) { setError(data.error ?? '新增失敗'); return }
      onDone()
    } catch {
      setError('網路錯誤')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="➕ 新增用戶" onClose={onClose}>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>用戶名</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} autoFocus placeholder="至少 2 個字元" />
        </div>
        <div className="field">
          <label>密碼</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 個字元" />
        </div>
        <div className="field-row">
          <div className="field">
            <label>角色</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
              <option value="user">用戶</option>
              <option value="admin">管理員</option>
            </select>
          </div>
          <div className="field">
            <label>每週上限 <span style={{ fontWeight: 400, color: '#9ca3af' }}>（-1 = 無限）</span></label>
            <input type="number" value={weeklyLimit} onChange={e => setWeeklyLimit(e.target.value)} min={-1} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button type="submit" className="btn-primary" disabled={loading || !username || !password} style={{ flex: 1 }}>
            {loading ? '新增中...' : '新增'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
        </div>
      </form>
    </Modal>
  )
}

// ── Edit User Modal ───────────────────────────────────────────────────────────

function EditUserModal({ user, token, selfId, onClose, onDone }: {
  user: UserRow; token: string; selfId: number; onClose: () => void; onDone: () => void
}) {
  const [username, setUsername] = useState(user.username)
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(user.role)
  const [status, setStatus] = useState(user.status)
  const [weeklyLimit, setWeeklyLimit] = useState(String(user.weekly_limit ?? -1))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body: Record<string, string | number> = { username, role, status, weekly_limit: Number(weeklyLimit) }
      if (password) body.password = password
      const res = await fetch(`${BASE}/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { ok: boolean; error?: string }
      if (!data.ok) { setError(data.error ?? '儲存失敗'); return }
      onDone()
    } catch {
      setError('網路錯誤')
    } finally {
      setLoading(false)
    }
  }

  const isSelf = user.id === selfId

  return (
    <Modal title={`✏️ 編輯用戶：${user.username}`} onClose={onClose}>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>用戶名</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label>新密碼 <span style={{ fontWeight: 400, color: '#9ca3af' }}>（留空不更改）</span></label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="留空不更改" />
        </div>
        <div className="field-row">
          <div className="field">
            <label>角色</label>
            <select value={role} onChange={e => setRole(e.target.value)} disabled={isSelf}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
              <option value="user">用戶</option>
              <option value="admin">管理員</option>
            </select>
          </div>
          <div className="field">
            <label>狀態</label>
            <select value={status} onChange={e => setStatus(e.target.value)} disabled={isSelf}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
              <option value="approved">已核准</option>
              <option value="pending">待審核</option>
              <option value="rejected">已停用</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>每週上限 <span style={{ fontWeight: 400, color: '#9ca3af' }}>（-1 = 無限制）</span></label>
          <input type="number" value={weeklyLimit} onChange={e => setWeeklyLimit(e.target.value)} min={-1} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button type="submit" className="btn-primary" disabled={loading || !username} style={{ flex: 1 }}>
            {loading ? '儲存中...' : '儲存'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
        </div>
      </form>
    </Modal>
  )
}

// ── User Detail Modal (logs) ──────────────────────────────────────────────────

function InputContent({ jsonStr }: { jsonStr: string }) {
  let data: InputLog
  try { data = JSON.parse(jsonStr) } catch { return null }
  const si = data.studentInfo
  const names = [si?.name1, si?.name2].filter(Boolean).join('、')
  const ids = [si?.studentId1, si?.studentId2].filter(Boolean).join('、')
  return (
    <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.8 }}>
      {names && <div><span style={{ color: '#9ca3af' }}>姓名：</span>{names}</div>}
      {ids && <div><span style={{ color: '#9ca3af' }}>學號：</span>{ids}</div>}
      {si?.department && <div><span style={{ color: '#9ca3af' }}>系所：</span>{si.department}</div>}
      {si?.group && <div><span style={{ color: '#9ca3af' }}>組別：</span>{si.group}</div>}
      {data.figureData && data.figureData.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ color: '#9ca3af', marginBottom: 2 }}>數據：</div>
          {data.figureData.map((f, i) => (
            <div key={i} style={{ paddingLeft: 8, color: '#6b7280' }}>
              {f.workLabel} 圖{(f.figureIndex ?? 0) + 1}：Vout={f.vout} Vin={f.vin} A理={f.atheory} A實={f.aactual} 誤差={f.errorPct}%
            </div>
          ))}
        </div>
      )}
      {data.questionList && (
        <div style={{ marginTop: 6 }}>
          <div style={{ color: '#9ca3af' }}>問題：</div>
          <div style={{ paddingLeft: 8, whiteSpace: 'pre-wrap' }}>{data.questionList.slice(0, 300)}{data.questionList.length > 300 ? '…' : ''}</div>
        </div>
      )}
      {data.discussionAnswers && (
        <div style={{ marginTop: 6 }}>
          <div style={{ color: '#9ca3af' }}>AI 回答（討論）：</div>
          <div style={{ paddingLeft: 8, whiteSpace: 'pre-wrap' }}>{data.discussionAnswers.slice(0, 300)}{data.discussionAnswers.length > 300 ? '…' : ''}</div>
        </div>
      )}
    </div>
  )
}

function DetailModal({ user, token, onClose }: { user: UserRow; token: string; onClose: () => void }) {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedLog, setExpandedLog] = useState<number | null>(null)
  const [tab, setTab] = useState<'input' | 'report'>('input')

  useEffect(() => {
    fetch(`${BASE}/api/admin/users/${user.id}/logs`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: { ok: boolean; logs: LogRow[] }) => { if (d.ok) setLogs(d.logs) })
      .finally(() => setLoading(false))
  }, [user.id, token])

  return (
    <Modal title={`📋 ${user.username} 的使用記錄`} onClose={onClose}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, textAlign: 'center', background: '#f9fafb', borderRadius: 8, padding: '12px 0' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a' }}>{user.usage_count}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>生成次數</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', background: '#f9fafb', borderRadius: 8, padding: '12px 0' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a' }}>{fmtTokens(user.total_tokens)}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Token 用量</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', background: '#f9fafb', borderRadius: 8, padding: '12px 0' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a' }}>{fmtLimit(user.weekly_limit)}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>每週上限</div>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 20 }}>載入中...</div>
      ) : logs.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 20 }}>尚無生成記錄</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map(log => (
            <div key={log.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
              <div
                style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: expandedLog === log.id ? '#f0f9ff' : 'white' }}
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
              >
                <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtDate(log.created_at)}</span>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[log.experiment_number, log.experiment_title].filter(Boolean).join(' ') || '（未命名）'}
                </span>
                <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>{fmtTokens(log.input_tokens + log.output_tokens)} tok</span>
                <span style={{ fontSize: 11, color: '#2563eb', flexShrink: 0 }}>{expandedLog === log.id ? '▲' : '▼'}</span>
              </div>
              {expandedLog === log.id && (
                <div style={{ borderTop: '1px solid #e5e7eb', background: '#fafafa' }}>
                  <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
                    {(['input', 'report'] as const).map(t => (
                      <button key={t} onClick={() => setTab(t)}
                        style={{ flex: 1, padding: '7px 0', fontSize: 12, border: 'none', background: tab === t ? 'white' : 'transparent', fontWeight: tab === t ? 600 : 400, color: tab === t ? '#1d4ed8' : '#6b7280', cursor: 'pointer', borderBottom: tab === t ? '2px solid #1d4ed8' : '2px solid transparent' }}>
                        {t === 'input' ? '輸入內容' : 'AI 生成'}
                      </button>
                    ))}
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    {tab === 'input' ? <InputContent jsonStr={log.input_json} /> : <ReportContent jsonStr={log.report_json} />}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ── Report content renderer ───────────────────────────────────────────────────

function ReportContent({ jsonStr }: { jsonStr: string }) {
  let report: { dataAnalysis: ContentBlock[]; experimentalErrors: ContentBlock[]; problemDiscussion: ContentBlock[] }
  try { report = JSON.parse(jsonStr) } catch {
    return <pre style={{ fontSize: 12, color: '#6b7280' }}>{jsonStr.slice(0, 200)}</pre>
  }

  function renderBlocks(blocks: ContentBlock[]) {
    return blocks.map((b, i) => {
      if (b.type === 'paragraph') return <p key={i} style={{ fontSize: 13, lineHeight: 1.6, margin: '4px 0', color: '#374151' }}>{b.text}</p>
      if (b.type === 'formula') return (
        <div key={i} style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace', margin: '4px 0', padding: '4px 8px', background: '#f3f4f6', borderRadius: 4 }}>
          ({b.number}) {b.latex}
        </div>
      )
      if (b.type === 'image') return (
        <div key={i} style={{ fontSize: 12, color: '#2563eb', margin: '4px 0', fontStyle: 'italic' }}>
          [圖片 工作{b.workIndex + 1} 圖{b.imageIndex + 1}] {b.caption}
        </div>
      )
      if (b.type === 'table') return (
        <div key={i} style={{ margin: '6px 0', overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>{b.headers.map((h, j) => <th key={j} style={{ border: '1px solid #d1d5db', padding: '3px 8px', background: '#f3f4f6', fontWeight: 600 }}>{h}</th>)}</tr></thead>
            <tbody>{b.rows.map((row, j) => <tr key={j}>{row.map((cell, k) => <td key={k} style={{ border: '1px solid #d1d5db', padding: '3px 8px' }}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
      return null
    })
  }

  const sections = [
    { title: '數據分析', blocks: report.dataAnalysis ?? [] },
    { title: '實驗誤差', blocks: report.experimentalErrors ?? [] },
    { title: '問題討論', blocks: report.problemDiscussion ?? [] },
  ]
  return (
    <div>
      {sections.map(s => s.blocks.length > 0 && (
        <div key={s.title} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.title}</div>
          {renderBlocks(s.blocks)}
        </div>
      ))}
    </div>
  )
}

// ── Stats View ───────────────────────────────────────────────────────────────

interface DailyStat { day: string; count: number; tokens: number }
interface StatsData {
  daily: DailyStat[]
  totals: { total_logs: number; active_users: number; total_tokens: number }
}

function BarChart({ data, valueKey, color, label }: {
  data: DailyStat[]; valueKey: 'count' | 'tokens'; color: string; label: string
}) {
  const max = Math.max(...data.map(d => d[valueKey]), 1)
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
        {data.map(d => {
          const h = Math.round((d[valueKey] / max) * 88)
          const shortDay = d.day.slice(5) // MM-DD
          return (
            <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 10, color: '#6b7280' }}>{d[valueKey] > 0 ? d[valueKey] : ''}</span>
              <div title={`${d.day}: ${d[valueKey]}`}
                style={{ width: '100%', height: h || 2, background: d[valueKey] > 0 ? color : '#e5e7eb', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
              <span style={{ fontSize: 9, color: '#9ca3af', writingMode: 'initial' }}>{shortDay}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatsView({ token }: { token: string }) {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${BASE}/api/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: { ok: boolean } & StatsData) => { if (d.ok) setStats(d) })
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>載入中...</div>
  if (!stats) return null

  // Fill missing days so we always show 14 days
  const days: DailyStat[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const key = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }) // YYYY-MM-DD
    const found = stats.daily.find(x => x.day === key)
    days.push(found ?? { day: key, count: 0, tokens: 0 })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {[
          { label: '累計生成', value: stats.totals.total_logs, color: '#2563eb' },
          { label: '活躍用戶', value: stats.totals.active_users, color: '#059669' },
          { label: '累計 Token', value: fmtTokens(stats.totals.total_tokens), color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} style={{ background: 'white', borderRadius: 10, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { valueKey: 'count' as const, color: '#2563eb', label: '近 14 天生成次數' },
          { valueKey: 'tokens' as const, color: '#7c3aed', label: '近 14 天 Token 用量' },
        ].map(c => (
          <div key={c.valueKey} style={{ background: 'white', borderRadius: 10, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
            <BarChart data={days} valueKey={c.valueKey} color={c.color} label={c.label} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Global Logs View ─────────────────────────────────────────────────────────

function GlobalLogsView({ token }: { token: string }) {
  const [logs, setLogs] = useState<GlobalLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [tab, setTab] = useState<'input' | 'report'>('input')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`${BASE}/api/admin/logs`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: { ok: boolean; logs: GlobalLogRow[] }) => { if (d.ok) setLogs(d.logs) })
      .finally(() => setLoading(false))
  }, [token])

  const filtered = logs.filter(l =>
    !search || l.username.toLowerCase().includes(search.toLowerCase()) ||
    l.experiment_title.toLowerCase().includes(search.toLowerCase()) ||
    l.experiment_number.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>生成記錄</span>
        <span style={{ fontSize: 13, color: '#9ca3af' }}>{filtered.length} 筆</span>
        <input type="text" placeholder="搜尋用戶、實驗名稱..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: 'auto', padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: 220, outline: 'none' }} />
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>載入中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>尚無記錄</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filtered.map((log, i) => {
            const isOpen = expandedId === log.id
            return (
              <div key={log.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                {/* Row header */}
                <div onClick={() => setExpandedId(isOpen ? null : log.id)}
                  style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: isOpen ? '#f0f9ff' : 'white' }}>
                  {/* Avatar */}
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor(log.username), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                    {log.username[0]}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', flexShrink: 0, minWidth: 60 }}>{log.username}</div>
                  <div style={{ fontSize: 13, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[log.experiment_number, log.experiment_title].filter(Boolean).join(' ') || '（未命名）'}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>{fmtTokens(log.input_tokens + log.output_tokens)} tok</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtDate(log.created_at)}</div>
                  <span style={{ fontSize: 11, color: '#2563eb', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                </div>
                {/* Expanded content */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #e5e7eb', background: '#fafafa' }}>
                    <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
                      {(['input', 'report'] as const).map(t => (
                        <button key={t} onClick={e => { e.stopPropagation(); setTab(t) }}
                          style={{ flex: 1, padding: '8px 0', fontSize: 13, border: 'none', background: tab === t ? 'white' : 'transparent',
                            fontWeight: tab === t ? 600 : 400, color: tab === t ? '#1d4ed8' : '#6b7280', cursor: 'pointer',
                            borderBottom: tab === t ? '2px solid #1d4ed8' : '2px solid transparent' }}>
                          {t === 'input' ? '輸入內容' : 'AI 生成'}
                        </button>
                      ))}
                    </div>
                    <div style={{ padding: '14px 20px', maxHeight: 400, overflowY: 'auto' }}>
                      {tab === 'input' ? <InputContent jsonStr={log.input_json} /> : <ReportContent jsonStr={log.report_json} />}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Admin Page ───────────────────────────────────────────────────────────

const FILTER_TABS = [
  { key: 'all',      label: '全部' },
  { key: 'pending',  label: '待審核' },
  { key: 'approved', label: '已核准' },
  { key: 'rejected', label: '已停用' },
] as const
type FilterKey = typeof FILTER_TABS[number]['key']

function exportCsv(users: UserRow[]) {
  const headers = ['用戶名', '角色', '狀態', '每週上限', '生成次數', 'Token用量', '註冊時間']
  const rows = users.map(u => [
    u.username,
    u.role === 'admin' ? '管理員' : '用戶',
    STATUS_LABEL[u.status] ?? u.status,
    fmtLimit(u.weekly_limit),
    u.usage_count,
    u.total_tokens,
    fmtDate(u.created_at),
  ])
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
  a.download = `users_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
}

export default function AdminPage() {
  const { token, user, logout } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editUser, setEditUser] = useState<UserRow | null>(null)
  const [detailUser, setDetailUser] = useState<UserRow | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [quickActionId, setQuickActionId] = useState<number | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [editingLimitId, setEditingLimitId] = useState<number | null>(null)
  const [editingLimitVal, setEditingLimitVal] = useState('')
  const [pageTab, setPageTab] = useState<'users' | 'logs' | 'stats'>('users')

  const authH = { Authorization: `Bearer ${token}` }

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch(`${BASE}/api/admin/users`, { headers: authH })
      const data = await res.json() as { ok: boolean; users: UserRow[] }
      if (data.ok) setUsers(data.users)
    } finally {
      setLoadingUsers(false)
    }
  }, [token])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function handleDelete(id: number) {
    setDeleteId(id)
    try {
      await fetch(`${BASE}/api/admin/users/${id}`, { method: 'DELETE', headers: authH })
      await fetchUsers()
    } finally {
      setDeleteId(null)
    }
  }

  function confirmDelete(u: UserRow) {
    if (confirm(`確定刪除用戶「${u.username}」？\n所有生成記錄也會一併刪除。`)) handleDelete(u.id)
  }

  async function handleBulkApprove() {
    if (!confirm(`確定批次核准所有 ${pendingCount} 位待審核用戶？`)) return
    setBulkLoading(true)
    try {
      await fetch(`${BASE}/api/admin/users/bulk-approve`, { method: 'POST', headers: authH })
      await fetchUsers()
    } finally {
      setBulkLoading(false)
    }
  }

  async function saveWeeklyLimit(id: number) {
    const val = Number(editingLimitVal)
    if (isNaN(val)) { setEditingLimitId(null); return }
    await fetch(`${BASE}/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { ...authH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekly_limit: val }),
    })
    setEditingLimitId(null)
    await fetchUsers()
  }

  async function quickSetStatus(id: number, status: string) {
    setQuickActionId(id)
    try {
      await fetch(`${BASE}/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { ...authH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await fetchUsers()
    } finally {
      setQuickActionId(null)
    }
  }

  const pendingCount = users.filter(u => u.status === 'pending').length
  const totalGenerations = users.reduce((s, u) => s + u.usage_count, 0)
  const totalTokens = users.reduce((s, u) => s + u.total_tokens, 0)

  const filteredUsers = users.filter(u => {
    if (filter !== 'all' && u.status !== filter) return false
    if (search && !u.username.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const filterCounts: Record<FilterKey, number> = {
    all: users.length,
    pending: users.filter(u => u.status === 'pending').length,
    approved: users.filter(u => u.status === 'approved').length,
    rejected: users.filter(u => u.status === 'rejected').length,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      {/* Header */}
      <div style={{ background: '#1d4ed8', color: 'white', padding: '0 28px', height: 54, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 8px rgba(29,78,216,0.3)' }}>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.01em' }}>管理後台</span>
        {pendingCount > 0 && (
          <span style={{ background: '#ef4444', borderRadius: 10, padding: '2px 9px', fontSize: 12, fontWeight: 600 }}>
            {pendingCount} 待審核
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, opacity: 0.75 }}>{user?.username}</span>
          <button onClick={() => navigate('/')}
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', color: 'white', borderRadius: 6, padding: '5px 14px', fontSize: 13, cursor: 'pointer' }}>
            回到 App
          </button>
          <button onClick={() => { logout(); navigate('/login') }}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.75)', borderRadius: 6, padding: '5px 14px', fontSize: 13, cursor: 'pointer' }}>
            返回登入介面
          </button>
        </div>
      </div>

      {/* Page tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '0 28px' }}>
        {[{ key: 'users', label: '用戶管理' }, { key: 'logs', label: '生成記錄' }, { key: 'stats', label: '統計' }].map(t => (
          <button key={t.key} onClick={() => setPageTab(t.key as 'users' | 'logs' | 'stats')}
            style={{ padding: '12px 20px', fontSize: 14, fontWeight: pageTab === t.key ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer',
              color: pageTab === t.key ? '#1d4ed8' : '#6b7280',
              borderBottom: pageTab === t.key ? '2px solid #1d4ed8' : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 28px' }}>

        {pageTab === 'stats' ? (
          <StatsView token={token!} />
        ) : pageTab === 'logs' ? (
          <GlobalLogsView token={token!} />
        ) : (<>

        {/* Stats cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: '總用戶', value: users.length, color: '#2563eb', bg: '#eff6ff' },
            { label: '待審核', value: pendingCount, color: pendingCount > 0 ? '#d97706' : '#6b7280', bg: pendingCount > 0 ? '#fffbeb' : '#f9fafb' },
            { label: '累計生成', value: totalGenerations, color: '#059669', bg: '#ecfdf5' },
            { label: '累計 Token', value: fmtTokens(totalTokens), color: '#7c3aed', bg: '#f5f3ff' },
          ].map(s => (
            <div key={s.label} style={{ background: 'white', borderRadius: 10, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', borderLeft: `4px solid ${s.color}` }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>

          {/* Toolbar */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 7, padding: 3 }}>
              {FILTER_TABS.map(t => (
                <button key={t.key} onClick={() => setFilter(t.key)}
                  style={{ padding: '5px 12px', borderRadius: 5, border: 'none', fontSize: 13, cursor: 'pointer', fontWeight: filter === t.key ? 600 : 400,
                    background: filter === t.key ? 'white' : 'transparent',
                    color: filter === t.key ? '#1d4ed8' : '#6b7280',
                    boxShadow: filter === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                  {t.label}
                  <span style={{ marginLeft: 5, fontSize: 11, color: filter === t.key ? '#2563eb' : '#9ca3af' }}>
                    {filterCounts[t.key]}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text" placeholder="搜尋用戶名..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: 180, outline: 'none' }}
            />

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {pendingCount > 0 && (
                <button onClick={handleBulkApprove} disabled={bulkLoading}
                  style={{ padding: '6px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #fbbf24', background: '#fffbeb', color: '#92400e', cursor: 'pointer', fontWeight: 500 }}>
                  {bulkLoading ? '核准中...' : `批次核准 ${pendingCount} 位`}
                </button>
              )}
              <button onClick={() => exportCsv(filteredUsers)}
                style={{ padding: '6px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db', background: 'white', color: '#374151', cursor: 'pointer' }}>
                匯出 CSV
              </button>
              <button onClick={() => setShowAdd(true)} className="btn-primary"
                style={{ padding: '6px 14px', fontSize: 13 }}>
                ＋ 新增用戶
              </button>
            </div>
          </div>

          {loadingUsers ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>載入中...</div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
              {search ? `找不到「${search}」` : '此分類沒有用戶'}
            </div>
          ) : (
            <div className="admin-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                  {['用戶名', '角色', '狀態', '生成次數', 'Token', '週上限', '註冊時間', '操作'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u, i) => (
                  <tr key={u.id}
                    style={{ borderBottom: i < filteredUsers.length - 1 ? '1px solid #f1f5f9' : 'none',
                      background: u.status === 'pending' ? '#fffdf5' : 'white',
                      transition: 'background 0.1s' }}>
                    <td style={{ padding: '11px 16px', fontWeight: 500, color: '#111827' }}>
                      {u.username}
                      {u.id === user?.id && <span style={{ marginLeft: 6, fontSize: 11, color: '#9ca3af' }}>（我）</span>}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: u.role === 'admin' ? '#ede9fe' : '#f3f4f6', color: u.role === 'admin' ? '#7c3aed' : '#6b7280', fontWeight: 500 }}>
                        {u.role === 'admin' ? '管理員' : '用戶'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: STATUS_BG[u.status], color: STATUS_COLOR[u.status] }}>
                        {STATUS_LABEL[u.status] ?? u.status}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', color: '#374151' }}>{u.usage_count || '—'}</td>
                    <td style={{ padding: '11px 16px', color: '#374151' }}>{fmtTokens(u.total_tokens)}</td>
                    <td style={{ padding: '8px 16px' }}>
                      {editingLimitId === u.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="number" value={editingLimitVal} autoFocus min={-1}
                            onChange={e => setEditingLimitVal(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveWeeklyLimit(u.id); if (e.key === 'Escape') setEditingLimitId(null) }}
                            style={{ width: 60, padding: '3px 6px', border: '1px solid #2563eb', borderRadius: 4, fontSize: 13, outline: 'none' }}
                          />
                          <button onClick={() => saveWeeklyLimit(u.id)}
                            style={{ padding: '3px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d', cursor: 'pointer' }}>
                            ✓
                          </button>
                          <button onClick={() => setEditingLimitId(null)}
                            style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid #e5e7eb', background: 'white', color: '#9ca3af', cursor: 'pointer' }}>
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingLimitId(u.id); setEditingLimitVal(String(u.weekly_limit)) }}
                          title="點擊編輯週上限"
                          style={{ background: 'none', border: '1px dashed transparent', borderRadius: 4, padding: '2px 6px', fontSize: 13, cursor: 'pointer',
                            color: u.weekly_limit === -1 ? '#9ca3af' : '#374151' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = '#d1d5db')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                          {fmtLimit(u.weekly_limit)}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '11px 16px', color: '#9ca3af', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(u.created_at)}</td>
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        {/* Quick approve/reject for pending */}
                        {u.status === 'pending' && (
                          <>
                            <button onClick={() => quickSetStatus(u.id, 'approved')} disabled={quickActionId === u.id}
                              title="核准" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontWeight: 600 }}>
                              ✓ 核准
                            </button>
                            <button onClick={() => quickSetStatus(u.id, 'rejected')} disabled={quickActionId === u.id}
                              title="停用" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
                              ✕
                            </button>
                          </>
                        )}
                        {u.status === 'approved' && u.id !== user?.id && (
                          <button onClick={() => quickSetStatus(u.id, 'rejected')} disabled={quickActionId === u.id}
                            title="停用帳號" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', cursor: 'pointer' }}>
                            停用
                          </button>
                        )}
                        {u.status === 'rejected' && (
                          <button onClick={() => quickSetStatus(u.id, 'approved')} disabled={quickActionId === u.id}
                            title="重新啟用" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d', cursor: 'pointer' }}>
                            啟用
                          </button>
                        )}
                        <button onClick={() => setEditUser(u)}
                          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: '1px solid #d1d5db', background: 'white', color: '#374151', cursor: 'pointer' }}>
                          編輯
                        </button>
                        <button onClick={() => setDetailUser(u)}
                          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: '1px solid #93c5fd', background: '#eff6ff', color: '#2563eb', cursor: 'pointer' }}>
                          記錄
                        </button>
                        {u.id !== user?.id && (
                          <button onClick={() => confirmDelete(u)} disabled={deleteId === u.id}
                            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
                            刪除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
        </>)}
      </div>

      {/* Modals */}
      {showAdd && (
        <AddUserModal token={token!} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); fetchUsers() }} />
      )}
      {editUser && (
        <EditUserModal user={editUser} token={token!} selfId={user!.id} onClose={() => setEditUser(null)} onDone={() => { setEditUser(null); fetchUsers() }} />
      )}
      {detailUser && (
        <DetailModal user={detailUser} token={token!} onClose={() => setDetailUser(null)} />
      )}
    </div>
  )
}
