# ReportAssist

AI 實驗報告生成助手 — 專為逢甲大學光電系應用電子學實驗設計，上傳實驗紀錄圖、電路圖、計算過程，AI 自動生成可直接繳交的 Word 格式報告。

## 使用流程
1. 上傳老師的模板 `.docx`（首次或模板更新時）
2. 每次實驗後上傳：
   - 實驗紀錄圖（照片）
   - 電路圖（照片）
   - 公式與計算過程（文字 or 照片）
   - 問題討論答案（文字）
3. AI 自動生成：數據分析 + 誤差分析（3+ 個誤差來源）+ 問題討論
4. 輸出完整 **Word 檔案**，可直接繳交

## 輸出格式規範
- 中文字型：標楷體；英文：Times New Roman；本文 size 10
- 圖片置中，標題在圖下方；表格置中，標題在表上方
- 公式用公式編輯器插入，左側編號，size 12
- 包含封面（系別、姓名、學號、組別、實驗 / 繳交日期、指導老師）

## 技術棧
- React 19 + TypeScript + Vite（前端 `02-web/`）
- Node.js 伺服器（後端 `04-server/`）
- KaTeX（公式渲染預覽）

## 快速開始
```bash
cd 02-web
npm install
npm run dev
```

---

## English

An AI lab-report generator built for the Applied Electronics labs at Feng Chia University's Photonics department. Upload your lab notes, circuit photos, and calculations — get back a Word document ready to submit.

### Workflow
1. Upload the instructor's template `.docx` (first time, or when the template changes)
2. After each lab, upload:
   - Lab notes (photo)
   - Circuit diagram (photo)
   - Formulas and calculation steps (text or photo)
   - Discussion-question answers (text)
3. AI generates: data analysis + error analysis (3+ error sources) + discussion
4. Outputs a complete **Word file** ready to hand in

### Output formatting rules
- Chinese font: 標楷體; English: Times New Roman; body text size 10
- Images centered with caption below; tables centered with caption above
- Formulas inserted via the equation editor, numbered on the left, size 12
- Includes a cover page (department, name, student ID, group, lab / submission date, instructor)

### Tech stack
- React 19 + TypeScript + Vite (frontend in `02-web/`)
- Node.js server (backend in `04-server/`)
- KaTeX (formula preview)

### Quick start
```bash
cd 02-web
npm install
npm run dev
```
