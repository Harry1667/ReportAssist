/**
 * AI 呼叫 — 走 proxy-cli REST API（clip.twloop.com/api/chat）
 */

const PROXY_URL = process.env.PROXY_URL ?? 'https://clip.twloop.com/api/chat'
const PROXY_STREAM_URL = `${PROXY_URL}/stream`
const PROXY_TOKEN = process.env.PROXY_TOKEN ?? ''
const PROXY_PROJECT = process.env.PROXY_PROJECT ?? 'agent-social'

export interface WorkField {
  key: string
  label: string
  unit?: string
}

export interface WorkAnalysis {
  workIndex: number
  label: string
  fields: WorkField[]
}

export interface AnalysisResult {
  works: WorkAnalysis[]
}

export interface FigureData {
  workIndex: number
  workLabel: string
  figureIndex: number   // 0-based
  imageIndex: number    // position in works[workIndex].images array; -1 if no image uploaded
  vout: string          // user input, e.g. "158mV"
  vin: string           // user input, e.g. "229mV"
  atheory: string       // user input, e.g. "-0.56"
  aactual: number       // computed: parseNum(vout) / parseNum(vin)
  errorPct: number      // computed: |atheory - aactual| / |atheory| * 100
}

export interface ExperimentInput {
  experimentNumber: string
  experimentTitle: string
  studentInfo: {
    name1: string; name2: string
    studentId1: string; studentId2: string
    department: string; group: string
    experimentDate: string; submitDate: string; instructor: string
  }
  labRecordImages: Array<{ base64: string; mediaType: string }>
  works: Array<{ label: string; images: Array<{ base64: string; mediaType: string }> }>
  figureData: FigureData[]
  questionList: string
  discussionAnswers: string
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

const EXAMPLE_OUTPUT = JSON.stringify({
  dataAnalysis: [
    { type: 'paragraph', text: '數據分析' },
    { type: 'paragraph', text: '工作一' },
    { type: 'image', workIndex: 0, imageIndex: 0, caption: '圖一、工作一Figure 1模擬圖', figureNumber: 1 },
    { type: 'paragraph', text: '工作二' },
    { type: 'image', workIndex: 1, imageIndex: 0, caption: '圖二、工作二Figure 1 模擬圖', figureNumber: 2 },
    { type: 'image', workIndex: 1, imageIndex: 1, caption: '圖三、工作二 Figure 3 模擬圖', figureNumber: 3 },
    { type: 'image', workIndex: 1, imageIndex: 2, caption: '圖四、工作二Figure 4 模擬圖', figureNumber: 4 },
    { type: 'paragraph', text: '工作三、理論分析' },
    { type: 'formula', latex: 'A = \\frac{V_{out}}{V_{in}}', number: 1 },
    { type: 'formula', latex: 'A_{th} = \\frac{R_2}{R_1}', number: 2 },
    { type: 'paragraph', text: '使用公式(1)增益值A' },
    { type: 'paragraph', text: '工作一 Figure 1（R1=10kΩ）實測增益：' },
    { type: 'formula', latex: 'A = \\frac{V_{out}}{V_{in}} = \\frac{158mV}{229mV} = -0.690', number: 3 },
    { type: 'paragraph', text: '百分誤差' },
    { type: 'paragraph', text: '工作一 Figure 1 百分誤差：' },
    { type: 'formula', latex: '\\frac{|A_{th}-A|}{|A_{th}|} \\times 100\\% = \\frac{|-0.56-(-0.690)|}{|-0.56|} \\times 100\\% = 23.2\\%', number: 4 },
  ],
  experimentalErrors: [
    { type: 'paragraph', text: '實驗誤差' },
    { type: 'paragraph', text: '1. 電阻精度誤差：實驗中使用的電阻皆有 ±5% 的公差，導致實際增益偏離理論值。建議改用精密電阻（±1%以內）降低此誤差 (工作三)。' },
    { type: 'paragraph', text: '2. 示波器讀值誤差：量測 Vout 與 Vin 時，光標判讀存在約 ±5mV 人為誤差。可改用數位萬用電表搭配峰值偵測功能 (工作一、工作二)。' },
    { type: 'paragraph', text: '3. 接線寄生電容干擾：麵包板連接線過長，引入寄生阻抗影響高頻特性，造成波形失真。建議縮短連接線並分開電源線與信號線 (工作一、工作二、工作三)。' },
  ],
  problemDiscussion: [
    { type: 'paragraph', text: '問題討論' },
    { type: 'paragraph', text: '問題一、請問對於減法電路而言，不同的交流訊號是否可以相減？' },
    { type: 'paragraph', text: '答：可以。減法電路利用運算放大器的差動輸入特性，電路可將兩訊號瞬時值相減輸出差值，頻率不同時波形較複雜，但電路功能不受影響。' },
    { type: 'paragraph', text: '問題二、請問一直流電壓與正弦波訊號相減，若以示波器 AC 檔位觀測其輸出波形，則直流電壓的改變對於輸出波形的觀測有何影響？' },
    { type: 'paragraph', text: '答：以 AC 檔位觀測時，示波器會自動濾除直流分量，因此直流電壓的改變不會影響輸出波形的外觀，觀測到的仍是正弦波形。若改用 DC 檔位觀測，波形會隨直流電壓上下偏移。' },
  ],
})

const PROVIDER_ORDER = ['gemini', 'openai', 'claude'] as const

// ── Non-streaming proxy calls ────────────────────────────────────────────────

async function callProxyOnce(
  prompt: string,
  images: Array<{ mime_type: string; data: string }>,
  provider: string
): Promise<string> {
  const body: Record<string, unknown> = {
    prompt,
    provider,
    project: PROXY_PROJECT,
    group: 'generate',
    max_tokens: 16000,
  }
  if (images.length > 0) body.images = images

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PROXY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Proxy 錯誤 ${res.status}: ${txt.slice(0, 200)}`)
  }

  const data = await res.json() as { ok: boolean; content: string; actual_provider?: string; actual_model?: string; error?: string }
  if (!data.ok) throw new Error(data.error ?? JSON.stringify(data))

  console.log(`[proxy] provider=${data.actual_provider} model=${data.actual_model}`)
  return data.content
}

function isRetryable(msg: string): boolean {
  return (
    msg.includes('503') || msg.includes('504') || msg.includes('502') ||
    msg.includes('過期') || msg.includes('expired') || msg.includes('auth') ||
    msg.includes('憑證') || msg.includes('timeout') || msg.includes('多模態') ||
    msg.includes('multimodal') || msg.includes('ECONNRESET') || msg.includes('Gateway')
  )
}

async function callProxy(prompt: string, images: Array<{ mime_type: string; data: string }>): Promise<string> {
  if (!PROXY_TOKEN) throw new Error('PROXY_TOKEN 未設定，請在 .env 填入')

  const errors: string[] = []

  for (const provider of PROVIDER_ORDER) {
    try {
      return await callProxyOnce(prompt, images, provider)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[proxy] ${provider} 失敗：${msg.slice(0, 120)}`)
      errors.push(`${provider}: ${msg.slice(0, 100)}`)
      if (!isRetryable(msg)) throw e
    }
  }

  if (images.length > 0) {
    console.warn('[proxy] 所有 provider 圖片模式都失敗，改用純文字模式...')
    const textOnlyPrompt = `[注意：因技術限制無法直接讀取圖片，請根據文字資訊盡力生成內容]\n\n${prompt}`
    const textErrors: string[] = []
    for (const provider of PROVIDER_ORDER) {
      try {
        return await callProxyOnce(textOnlyPrompt, [], provider)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[proxy] ${provider} text-only 失敗：${msg.slice(0, 120)}`)
        textErrors.push(`${provider}: ${msg.slice(0, 100)}`)
        if (!isRetryable(msg)) throw e
      }
    }
    errors.push(...textErrors.map(e => `[text-only] ${e}`))
  }

  throw new Error(`所有 provider 都失敗：\n${errors.join('\n')}`)
}

// ── Streaming proxy calls ────────────────────────────────────────────────────

async function callProxyOnceStreaming(
  prompt: string,
  images: Array<{ mime_type: string; data: string }>,
  provider: string,
  onChunk: (text: string) => void | Promise<void>
): Promise<string> {
  const body: Record<string, unknown> = {
    prompt, provider, project: PROXY_PROJECT, group: 'generate', max_tokens: 16000,
  }
  if (images.length > 0) body.images = images

  const res = await fetch(PROXY_STREAM_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PROXY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Proxy 錯誤 ${res.status}: ${txt.slice(0, 200)}`)
  }

  if (!res.body) throw new Error('No response body for streaming')

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let accumulated = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buf += dec.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''

    for (const part of parts) {
      const lines = part.split('\n')
      let event = 'message'
      let data = ''
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data = line.slice(5).trim()
      }

      if (!data || data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data) as Record<string, unknown>

        if (!parsed.ok && parsed.error) throw new Error(String(parsed.error))

        if (event === 'done' || typeof parsed.content === 'string') {
          if (parsed.content) accumulated = parsed.content as string
          console.log(`[proxy/stream] done provider=${provider}`)
        } else {
          // Handle multiple chunk formats
          type OpenAIChunk = { choices?: [{ delta?: { content?: string } }] }
          const text =
            (parsed.text as string | undefined) ||
            ((parsed as OpenAIChunk).choices?.[0]?.delta?.content) ||
            ''
          if (text) {
            accumulated += text
            await onChunk(text)
          }
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue
        throw e
      }
    }
  }

  if (!accumulated) throw new Error('串流回應為空')
  return accumulated
}

async function callProxyWithStream(
  prompt: string,
  images: Array<{ mime_type: string; data: string }>,
  onChunk: (text: string) => void | Promise<void>
): Promise<string> {
  if (!PROXY_TOKEN) throw new Error('PROXY_TOKEN 未設定')

  const errors: string[] = []

  for (const provider of PROVIDER_ORDER) {
    try {
      return await callProxyOnceStreaming(prompt, images, provider, onChunk)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[proxy/stream] ${provider} 失敗：${msg.slice(0, 120)}`)
      errors.push(`${provider}: ${msg.slice(0, 100)}`)
      if (!isRetryable(msg)) throw e
    }
  }

  if (images.length > 0) {
    console.warn('[proxy/stream] 改用純文字串流模式...')
    const textOnly = `[注意：因技術限制無法直接讀取圖片，請根據文字資訊盡力生成內容]\n\n${prompt}`
    const textErrors: string[] = []
    for (const provider of PROVIDER_ORDER) {
      try {
        return await callProxyOnceStreaming(textOnly, [], provider, onChunk)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        textErrors.push(`${provider}: ${msg.slice(0, 100)}`)
        if (!isRetryable(msg)) throw e
      }
    }
    errors.push(...textErrors.map(e => `[text-only] ${e}`))
  }

  throw new Error(`所有 provider 串流都失敗：\n${errors.join('\n')}`)
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function generateReport(
  input: ExperimentInput,
  onChunk?: (chunk: string) => void | Promise<void>
): Promise<GeneratedReport> {
  const worksDesc = input.works
    .map((w, wi) => {
      const figMap = input.figureData
        .filter(f => f.workIndex === wi && f.imageIndex >= 0)
        .map(f => `Figure ${f.figureIndex + 1}→imageIndex ${f.imageIndex}`)
        .join(', ')
      const suffix = figMap ? `（${figMap}）` : '（無截圖）'
      return `  workIndex=${wi}（${w.label}）：${w.images.length} 張截圖 ${suffix}`
    })
    .join('\n')

  const figureDesc = input.figureData.length > 0
    ? '\n===已計算的增益數據（直接使用，不要重新計算）===\n' +
      input.figureData.map(f => {
        const aactualStr = f.aactual.toFixed(2)
        const errorStr = f.errorPct.toFixed(1)
        const gainLatex = `A=\\frac{${f.vout}}{${f.vin}}=${aactualStr}`
        const errorLatex = `\\frac{|${f.atheory}-${aactualStr}|}{|${f.atheory}|}\\times 100\\%=${errorStr}\\%`
        return `${f.workLabel} Figure ${f.figureIndex + 1}：V_out=${f.vout}, V_in=${f.vin}, 實際增益 A=${aactualStr}, 理論增益 A_th=${f.atheory}, 百分誤差=${errorStr}%\n  增益公式 LaTeX：${gainLatex}\n  誤差公式 LaTeX：${errorLatex}`
      }).join('\n')
    : ''

  const prompt = `你是大學實驗報告撰寫助手。請根據以下資料，嚴格按照規則生成完整的實驗報告 JSON。

實驗名稱：${input.experimentTitle}
各工作的 Multisim 截圖（workIndex / imageIndex 對應關係）：
${worksDesc}
${figureDesc}

老師的問題：
${input.questionList}

學生的回答要點：
${input.discussionAnswers || '（請根據實驗內容自行推導詳細答案）'}

圖片順序說明：
- 前 ${input.labRecordImages.length} 張：實驗紀錄書掃描，請從中讀取所有實際量測數值
- 後續圖片依序為各工作的 Multisim 模擬截圖

=== 以下為完整輸出範例（JSON 格式），請嚴格仿照其結構與規則 ===
${EXAMPLE_OUTPUT}
=== 範例結束 ===

【絕對規則，違反任何一條即為錯誤輸出】

▌ 通用格式
1. 只輸出一個 JSON 物件，不要有任何前後說明文字或 \`\`\`json 標記
2. type:"paragraph" — text 只能含純繁體中文與 Unicode 符號，嚴禁任何 LaTeX（$...$ 或 $$...$$）
3. type:"formula" — latex 用標準 LaTeX；number 從 1 開始全文連續遞增，不可跳號或重複
4. type:"image" — workIndex/imageIndex 對應上方截圖表格；figureNumber 全文連續；caption 格式：「圖N、說明」（N 為中文數字）
5. type:"table" — caption 填 ""；headers 和 rows 填入完整數據

▌ dataAnalysis — 嚴格依照以下順序
6.  paragraph："數據分析"
7.  paragraph："工作一"，緊接插入 workIndex=0 的所有截圖（image）
8.  paragraph："工作二"，緊接插入 workIndex=1 的所有截圖（image，依 imageIndex 順序）
9.  paragraph："工作三、理論分析"
10. formula：基礎增益公式定義（如 A=Vout/Vin，A=R2/R1 等，使用提供的 LaTeX）
11. paragraph："使用公式(N)增益值A"，後跟各 Figure 計算說明 paragraph + formula
12. paragraph："百分誤差"，後跟各 Figure 誤差說明 paragraph + formula（使用提供的 LaTeX）

▌ experimentalErrors — 第一個元素必須是標題
30. 第一個 paragraph："實驗誤差"
31. 至少 3 條，格式："N. 誤差原因說明。改善方法。 (工作X)"（阿拉伯數字編號）

▌ problemDiscussion — 第一個元素必須是標題
32. 第一個 paragraph："問題討論"
33. 每題：先 paragraph 重述問題（"問題N、..."），再 paragraph 作答（"答：..."）
34. 禁用 LaTeX，只用 Unicode 符號；順序與題目清單完全一致`

  const allImages = [
    ...input.labRecordImages.map((img) => ({ mime_type: img.mediaType, data: img.base64 })),
    ...input.works.flatMap((w) => w.images.map((img) => ({ mime_type: img.mediaType, data: img.base64 }))),
  ]

  let content: string
  if (onChunk) {
    try {
      content = await callProxyWithStream(prompt, allImages, onChunk)
    } catch (streamErr) {
      console.warn('[generateReport] 串流失敗，回退到普通請求:', streamErr)
      content = await callProxy(prompt, allImages)
    }
  } else {
    content = await callProxy(prompt, allImages)
  }

  // Strip ```json ... ``` wrapper if present, then extract JSON object
  const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  const jsonMatch = stripped.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`AI 回應格式錯誤，無法解析 JSON（前 300 字）：${content.slice(0, 300)}`)

  try {
    return JSON.parse(jsonMatch[0]) as GeneratedReport
  } catch {
    throw new Error(`AI 回應 JSON 格式損壞（前 400 字）：${content.slice(0, 400)}`)
  }
}
