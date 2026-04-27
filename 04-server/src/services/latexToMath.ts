/**
 * Minimal LaTeX → docx Math converter
 * Supports the subset used in electronics lab reports:
 * \frac{a}{b}, _{a}, ^{a}, |...|, \times, \%, \approx, \pm, plain text
 */

import {
  MathRun,
  MathFraction,
  MathNumerator,
  MathDenominator,
  MathSubScript,
  MathSuperScript,
  MathSubSuperScript,
  type MathComponent,
} from 'docx'

const SYMBOL_MAP: Record<string, string> = {
  'times': '×',
  '%': '%',
  'approx': '≈',
  'pm': '±',
  'neq': '≠',
  'leq': '≤',
  'geq': '≥',
  'infty': '∞',
  'Omega': 'Ω',
  'omega': 'ω',
  'Delta': 'Δ',
  'alpha': 'α',
  'beta': 'β',
  'mu': 'μ',
  'cdot': '·',
  'div': '÷',
  'ldots': '...',
}

// Read content inside braces { ... }, returns { content, nextIndex }
function readBraced(src: string, start: number): { content: string; next: number } {
  if (src[start] !== '{') {
    // single char
    return { content: src[start] ?? '', next: start + 1 }
  }
  let depth = 1
  let i = start + 1
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') depth--
    if (depth > 0) i++
    else i++
  }
  return { content: src.slice(start + 1, i - 1), next: i }
}

// Read a LaTeX command name starting after backslash
function readCommandName(src: string, start: number): { name: string; next: number } {
  if (/[^a-zA-Z]/.test(src[start])) {
    return { name: src[start], next: start + 1 }
  }
  let i = start
  while (i < src.length && /[a-zA-Z]/.test(src[i])) i++
  return { name: src.slice(start, i), next: i }
}

export function parseLaTeX(latex: string): MathComponent[] {
  const result: MathComponent[] = []
  let i = 0

  function peek() { return i < latex.length ? latex[i] : '' }

  function parseOne(): MathComponent | null {
    // skip spaces
    while (i < latex.length && latex[i] === ' ') i++
    if (i >= latex.length) return null

    const ch = latex[i]

    if (ch === '\\') {
      i++ // consume backslash
      const { name, next } = readCommandName(latex, i)
      i = next

      if (name === 'frac') {
        const num = readBraced(latex, i)
        i = num.next
        const den = readBraced(latex, i)
        i = den.next
        return new MathFraction({
          numerator: parseLaTeX(num.content),
          denominator: parseLaTeX(den.content),
        })
      }

      const sym = SYMBOL_MAP[name]
      return new MathRun(sym ?? name)
    }

    if (ch === '{') {
      const { content, next } = readBraced(latex, i)
      i = next
      // Group: return as multiple? Wrap in a pseudo-group by returning first
      // For sub/sup handling, return all as sequence via a trick:
      // We push all but first into result and return first
      const children = parseLaTeX(content)
      if (children.length === 0) return new MathRun('')
      if (children.length === 1) return children[0]
      // Push the rest and return first
      result.push(...children.slice(1))
      return children[0]
    }

    if (ch === '|') {
      i++ // consume first |
      // find matching |
      let depth = 0
      const start = i
      while (i < latex.length) {
        if (latex[i] === '{') depth++
        else if (latex[i] === '}') depth--
        else if (latex[i] === '|' && depth === 0) break
        i++
      }
      const inner = latex.slice(start, i)
      if (i < latex.length) i++ // consume closing |
      return new MathRun('|' + inner + '|') // simplified: use MathRun with | symbols
    }

    if (ch === '_' || ch === '^') {
      // Needs previous token - handled below in the main loop
      return null
    }

    // Plain text / number run — accumulate until special char
    let text = ''
    while (i < latex.length) {
      const c = latex[i]
      if (c === '\\' || c === '{' || c === '}' || c === '_' || c === '^' || c === '|') break
      if (c === ' ') { i++; break }
      text += c
      i++
    }
    return text ? new MathRun(text) : null
  }

  while (i < latex.length) {
    // skip spaces
    while (i < latex.length && latex[i] === ' ') i++
    if (i >= latex.length) break

    // Handle sub/superscript BEFORE parsing next base
    if (latex[i] === '_' || latex[i] === '^') {
      const prev = result.pop()
      const base = prev ?? new MathRun('')
      const isSub = latex[i] === '_'
      i++
      const { content: scriptContent, next } = readBraced(latex, i)
      i = next

      // Check if followed by the other script type
      while (i < latex.length && latex[i] === ' ') i++
      if (isSub && i < latex.length && latex[i] === '^') {
        i++
        const { content: supContent, next: next2 } = readBraced(latex, i)
        i = next2
        result.push(new MathSubSuperScript({
          children: [base],
          subScript: parseLaTeX(scriptContent),
          superScript: parseLaTeX(supContent),
        }))
      } else if (!isSub && i < latex.length && latex[i] === '_') {
        i++
        const { content: subContent, next: next2 } = readBraced(latex, i)
        i = next2
        result.push(new MathSubSuperScript({
          children: [base],
          subScript: parseLaTeX(subContent),
          superScript: parseLaTeX(scriptContent),
        }))
      } else if (isSub) {
        result.push(new MathSubScript({
          children: [base],
          subScript: parseLaTeX(scriptContent),
        }))
      } else {
        result.push(new MathSuperScript({
          children: [base],
          superScript: parseLaTeX(scriptContent),
        }))
      }
      continue
    }

    const comp = parseOne()
    if (comp !== null) result.push(comp)
  }

  return result
}
