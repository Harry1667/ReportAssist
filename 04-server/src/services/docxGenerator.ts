import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, Packer, ImageRun, BorderStyle,
  Math as DocxMath,
  LineRuleType,
  type MathComponent,
} from 'docx'
import { parseLaTeX } from './latexToMath'
import type { ExperimentInput, ContentBlock } from './claude'

// ── Font config (exact values from template XML) ─────────────────────────────
// 逢甲大學 / 應用電子學實驗 / 資訊欄 — hAnsi=標楷體 (from template w:rFonts)
const FONT_COVER_H = { ascii: 'Times New Roman', eastAsia: '標楷體', hAnsi: '標楷體',          cs: 'Times New Roman' }
// 實驗N / 實驗標題 — hAnsi=Times New Roman (from template w:rFonts)
const FONT_COVER_S = { ascii: 'Times New Roman', eastAsia: '標楷體', hAnsi: 'Times New Roman', cs: 'Times New Roman' }
// 內文 / 標題 / 圖表標 — cs=Mangal (from template w:rFonts)
const FONT_BODY    = { ascii: 'Times New Roman', eastAsia: '標楷體', hAnsi: 'Times New Roman', cs: 'Mangal' }

// Sizes in half-points (from student doc w:sz values)
const SZ_TITLE = 72  // 36pt — 逢甲/課程/實驗號/題目
const SZ_COVER = 48  // 24pt — 系別/姓名/...
const SZ_BODY  = 20  // 10pt — 內文、圖標、表標、標題
const SZ_MATH  = 20  // 10pt — 公式 (student docs use 20, same as body)

// Line spacing (from template w:spacing w:line="360" w:lineRule="auto")
const LINE_BODY = { line: 360, lineRule: LineRuleType.AUTO }

// Page margins (from template w:pgMar — exact twip values)
const PAGE_MARGIN = { top: 720, right: 720, bottom: 720, left: 720, header: 851, footer: 992 }

const IMG_WIDTH  = 440
const IMG_HEIGHT = 320

// ── Helpers ──────────────────────────────────────────────────────────────────
const CN_NUMS = ['一','二','三','四','五','六','七','八','九','十','十一','十二']
function toCnNum(n: number): string { return CN_NUMS[n - 1] ?? String(n) }

function normalizeCnCaption(caption: string): string {
  return caption
    .replace(/圖(\d+)、/g, (_, n) => `圖${toCnNum(Number(n))}、`)
    .replace(/表(\d+)、/g, (_, n) => `表${toCnNum(Number(n))}、`)
}

function stripInlineLatex(text: string): string {
  return text
    .replace(/\$\$[\s\S]+?\$\$/g, '[公式]')
    .replace(/\$([^$\n]+?)\$/g, '$1')
}

function run(text: string, opts: { bold?: boolean; size?: number; font?: typeof FONT_BODY } = {}): TextRun {
  return new TextRun({
    text,
    font: opts.font ?? FONT_BODY,
    size: opts.size ?? SZ_BODY,
    bold: opts.bold ?? false,
  })
}

// Body paragraph — 1.5× line spacing, no extra spacing
function bodyPara(text: string): Paragraph {
  return new Paragraph({
    children: [run(stripInlineLatex(text))],
    spacing: { ...LINE_BODY, after: 0 },
  })
}

// Section heading — bold, 1.5× spacing (數據分析 / 工作一 / 實驗誤差 / 問題討論)
function heading(text: string): Paragraph {
  return new Paragraph({
    children: [run(text, { bold: true })],
    spacing: { ...LINE_BODY, before: 240, after: 0 },
  })
}

// Formula — borderless 3-col table: [empty 10%] | [centered formula 80%] | [(N) right 10%]
// Per rules: "公式本身要居中，在最右加入標號；大小12"
const NO_BORDER   = { style: BorderStyle.NONE, size: 0, color: 'auto' }
const CELL_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }

function formulaParagraph(latex: string, number: number): Table {
  const mathChildren: MathComponent[] = parseLaTeX(latex)
  const cell = (children: Paragraph[], pct: number) =>
    new TableCell({ children, width: { size: pct, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS })
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
      insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
    },
    rows: [new TableRow({ children: [
      cell([new Paragraph({ children: [] })], 10),
      cell([new Paragraph({
        children: [new DocxMath({ children: mathChildren })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 60 },
      })], 80),
      cell([new Paragraph({
        children: [new TextRun({ text: `(${number})`, font: FONT_BODY, size: SZ_MATH })],
        alignment: AlignmentType.RIGHT,
        spacing: { before: 60, after: 60 },
      })], 10),
    ]})],
  })
}

// Caption run — szCs=18 per student doc XML (w:szCs w:val="18")
function captionRun(text: string): TextRun {
  return new TextRun({ text, font: FONT_BODY, size: SZ_BODY, sizeComplexScript: 18 })
}

// Image paragraph — centered, caption BELOW (per rules)
function imageParagraph(data: Buffer, type: 'jpg' | 'png', caption: string): Paragraph[] {
  return [
    new Paragraph({
      children: [new ImageRun({ data, type, transformation: { width: IMG_WIDTH, height: IMG_HEIGHT } })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 0 },
    }),
    new Paragraph({
      children: [captionRun(caption)],
      alignment: AlignmentType.CENTER,
      spacing: { ...LINE_BODY, after: 120 },
    }),
  ]
}

// Table — NO caption (per spec), cells centered
function dataTable(_caption: string, headers: string[], rows: string[][]): (Paragraph | Table)[] {
  const makeCell = (text: string, bold = false) =>
    new TableCell({
      children: [new Paragraph({
        children: [run(text, { bold })],
        alignment: AlignmentType.CENTER,
        spacing: LINE_BODY,
      })],
    })

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: headers.map(h => makeCell(h, true)) }),
        ...rows.map(r => new TableRow({ children: r.map(c => makeCell(c)) })),
      ],
    }),
    new Paragraph({ children: [], spacing: { after: 120 } }),
  ]
}

function mimeToType(mime: string): 'jpg' | 'png' {
  return mime.includes('png') ? 'png' : 'jpg'
}

type WorkImages = Array<{ buffer: Buffer; mime: string }>

function renderBlocks(blocks: ContentBlock[], workImageMap: WorkImages[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      out.push(bodyPara(block.text))
    } else if (block.type === 'formula') {
      out.push(formulaParagraph(block.latex, block.number))
    } else if (block.type === 'image') {
      const img = workImageMap[block.workIndex]?.[block.imageIndex]
      const caption = normalizeCnCaption(block.caption)
      if (img) {
        out.push(...imageParagraph(img.buffer, mimeToType(img.mime), caption))
      } else {
        out.push(bodyPara(`[圖片未找到：work=${block.workIndex} img=${block.imageIndex}]`))
      }
    } else if (block.type === 'table') {
      out.push(...dataTable(normalizeCnCaption(block.caption), block.headers, block.rows))
    }
  }
  return out
}

// ── Cover page helpers ───────────────────────────────────────────────────────

// 逢甲大學 / 應用電子學實驗 — FONT_COVER_H (hAnsi=標楷體), bold, 36pt, centered
function titleParaH(text: string, spaceAfter = 120): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT_COVER_H, size: SZ_TITLE, bold: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: spaceAfter },
  })
}

// 實驗N / 實驗標題 — FONT_COVER_S (hAnsi=Times New Roman), bold, 36pt, centered
function titleParaS(text: string, spaceAfter = 120): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT_COVER_S, size: SZ_TITLE, bold: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: spaceAfter },
  })
}

// 資訊欄 — FONT_COVER_H, 24pt, LEFT aligned, 7 spaces indent (matching student docs)
const INFO_INDENT = '       '  // 7 half-width spaces (from student doc XML)
function infoLinePara(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: INFO_INDENT,  font: FONT_COVER_H, size: SZ_COVER }),
      new TextRun({ text: `${label}：`, font: FONT_COVER_H, size: SZ_COVER }),
      new TextRun({ text: value,        font: FONT_COVER_H, size: SZ_COVER }),
    ],
    spacing: { after: 60 },
  })
}

// ── Main export ──────────────────────────────────────────────────────────────
type StudentInfo = ExperimentInput['studentInfo']

export async function buildDocx(
  info: { studentInfo: StudentInfo; experimentNumber: string; experimentTitle: string },
  report: { dataAnalysis: ContentBlock[]; experimentalErrors: ContentBlock[]; problemDiscussion: ContentBlock[] },
  workImageMap: WorkImages[]
): Promise<Buffer> {
  const { studentInfo, experimentNumber, experimentTitle } = info
  const names = [studentInfo.name1, studentInfo.name2].filter(Boolean).join(' ')
  const ids   = [studentInfo.studentId1, studentInfo.studentId2].filter(Boolean).join(' ')

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: PAGE_MARGIN },
      },
      children: [
        // ── Cover ─────────────────────────────────────────────────────────
        // 逢甲大學光電學系 / 應用電子學實驗(二) — FONT_COVER_H
        titleParaH('逢甲大學光電學系',    120),
        titleParaH('應用電子學實驗(二)', 480),

        // 實驗四 / 減法電路 — FONT_COVER_S
        ...(experimentNumber ? [titleParaS(experimentNumber, 60)] : []),
        titleParaS(experimentTitle, 960),

        // 資訊欄 — FONT_COVER_H, 24pt, LEFT aligned
        infoLinePara('系別', studentInfo.department),
        infoLinePara('姓名', names),
        infoLinePara('學號', ids),
        infoLinePara('組別', studentInfo.group),
        infoLinePara('實驗日期', studentInfo.experimentDate),
        infoLinePara('繳交日期', studentInfo.submitDate),
        infoLinePara('指導老師', studentInfo.instructor),

        // ── Content (new page) ────────────────────────────────────────────
        // AI generates ALL section headings within each block array
        new Paragraph({ children: [], pageBreakBefore: true }),

        ...renderBlocks(report.dataAnalysis, workImageMap),

        ...renderBlocks(report.experimentalErrors, workImageMap),
        new Paragraph({ children: [], spacing: { after: 120 } }),

        ...renderBlocks(report.problemDiscussion, workImageMap),
      ],
    }],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}
