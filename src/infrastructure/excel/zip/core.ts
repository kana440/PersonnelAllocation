// ZIP エクスポートの純粋処理（DOM・state への依存なし）
// exporter.ts と zipWorker.ts の両方からインポートされる。

import JSZip from 'jszip'
import { ALLOCATION_LIST_FIELDS } from '../../../domain/csvImport/allocationList/labels'
import type { AllocationRow } from '../../allocationListMapper'

// ── シート構造の固定定数 ─────────────────────────────────────────────────────

export const EXPORT_SHEET_NAME = '要員配置リスト'
export const EXPORT_FIELDS     = ALLOCATION_LIST_FIELDS
export const HEADER_SET        = new Set(ALLOCATION_LIST_FIELDS.map(f => (f.header ?? f.key).trim()))
export const HEADER_ROW        = 4    // ヘッダー行の Excel 行番号（1-based）
export const DATA_START        = 5    // データ開始行番号（HEADER_ROW + 1）
export const START_COL         = 'A'  // 最左列（担当者列の候補）

// ── XML ヘルパー ─────────────────────────────────────────────────────────────

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function idxToCol(idx: number): string {
  let s = ''
  let n = idx + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function colToIdx(col: string): number {
  let n = 0
  for (const ch of col.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

// ── 共有文字列の解析 ─────────────────────────────────────────────────────────

export function parseSharedStrings(xml: string): string[] {
  const result: string[] = []
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  let m
  while ((m = siRe.exec(xml)) !== null) {
    const inner = m[1]
    let text = ''
    const tRe = /<t(?:\s[^>]*)?>([^<]*)<\/t>/g
    let t
    while ((t = tRe.exec(inner)) !== null) text += t[1]
    result.push(text)
  }
  return result
}

// ── シート XML のパース（先頭数行のみ）──────────────────────────────────────

export interface CellInfo {
  col: string
  text: string
  styleIdx: string
}

export interface RowInfo {
  rowNum: number
  xml: string
  cells: CellInfo[]
}

function parseCellXml(cellXml: string, sharedStrings: string[]): CellInfo {
  const refM   = cellXml.match(/\br="([A-Z]+)\d+"/)
  const typeM  = cellXml.match(/\bt="([^"]+)"/)
  const styleM = cellXml.match(/\bs="(\d+)"/)
  const col      = refM?.[1] ?? ''
  const type     = typeM?.[1] ?? ''
  const styleIdx = styleM?.[1] ?? ''

  let text = ''
  if (type === 's') {
    const vM = cellXml.match(/<v>(\d+)<\/v>/)
    if (vM) text = sharedStrings[parseInt(vM[1])] ?? ''
  } else if (type === 'inlineStr') {
    const tM = cellXml.match(/<t[^>]*>([^<]*)<\/t>/)
    text = tM?.[1] ?? ''
  } else {
    const vM = cellXml.match(/<v>([^<]*)<\/v>/)
    text = vM?.[1] ?? ''
  }

  return { col, text, styleIdx }
}

// 先頭 MAX_HEAD_ROWS 行のみ解析して停止（全行走査を回避）。
// 行ごとの末尾オフセット（rowEndPositions）も返す。
const MAX_HEAD_ROWS = 12

export function parseHeadRows(
  sheetDataContent: string,
  sharedStrings: string[],
): { rows: RowInfo[]; rowEndPositions: number[] } {
  const rows: RowInfo[] = []
  const rowEndPositions: number[] = []

  const rowRe = /(<row\b[^>]*r="(\d+)"[^>]*\/>)|(<row\b[^>]*r="(\d+)"[^>]*>)([\s\S]*?)(<\/row>)/g
  let m
  while ((m = rowRe.exec(sheetDataContent)) !== null) {
    const rowNum = m[1] ? parseInt(m[2]) : parseInt(m[4])
    if (m[1]) {
      rows.push({ rowNum, xml: m[1], cells: [] })
    } else {
      const cells: CellInfo[] = []
      const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
      let c
      while ((c = cellRe.exec(m[5])) !== null) {
        cells.push(parseCellXml(`<c ${c[1]}>${c[2] ?? ''}</c>`, sharedStrings))
      }
      rows.push({ rowNum, xml: m[0], cells })
    }
    rowEndPositions.push(rowRe.lastIndex)
    if (rows.length >= MAX_HEAD_ROWS) break
  }

  return { rows, rowEndPositions }
}

// ヘッダー行をコンテンツから動的に検出（固定行番号に依存しない）
function findHeaderRow(
  rows: RowInfo[],
): { idx: number; headerTextToCol: Map<string, string> } | null {
  let bestIdx = -1, bestScore = 1
  let bestMap = new Map<string, string>()

  for (let i = 0; i < rows.length; i++) {
    let score = 0
    const map = new Map<string, string>()
    for (const cell of rows[i].cells) {
      const h = cell.text.trim()
      if (HEADER_SET.has(h)) { score++; map.set(h, cell.col) }
    }
    if (score > bestScore) { bestScore = score; bestIdx = i; bestMap = map }
  }

  return bestIdx === -1 ? null : { idx: bestIdx, headerTextToCol: bestMap }
}

// ── 列デフォルトスタイルの解析 ───────────────────────────────────────────────

// <cols> から 列番号(1-based) → デフォルトスタイルインデックス を生成
export function parseColDefaultStyles(beforeSheetData: string): Map<number, string> {
  const result = new Map<number, string>()
  const colsMatch = beforeSheetData.match(/<cols\b[^>]*>([\s\S]*?)<\/cols>/)
  if (!colsMatch) return result

  const colRe = /<col\b([^>]*?)(?:\/?>)/g
  let m
  while ((m = colRe.exec(colsMatch[1])) !== null) {
    const attrs = m[1]
    const minM  = attrs.match(/\bmin="(\d+)"/)
    const maxM  = attrs.match(/\bmax="(\d+)"/)
    const styleM = attrs.match(/\bstyle="(\d+)"/)
    if (!minM || !maxM || !styleM) continue
    for (let col = parseInt(minM[1]); col <= parseInt(maxM[1]); col++) {
      result.set(col, styleM[1])
    }
  }
  return result
}

// ── 新データ行の生成 ─────────────────────────────────────────────────────────

export function exportFieldValue(row: AllocationRow, key: string): string | undefined {
  const val = (row as Record<string, unknown>)[key]
  if (key === 'positionCode') {
    const s = typeof val === 'string' ? val : ''
    return s.startsWith('_pos_') ? undefined : (val as string | undefined)
  }
  return (val !== undefined && val !== null && val !== '') ? String(val) : undefined
}

export function buildDataRowXml(
  rowNum: number,
  row: AllocationRow,
  headerTextToCol: Map<string, string>,
  assigneeCol: string | null,
  styleByCol: Map<string, string>,
  colDefaults: Map<number, string>,
  rowDefaultStyle: string | undefined,  // 行デフォルトスタイル（customFormat="1" の s=）
  templateRowAttrs: string,
): string {
  const cells: { colIdx: number; xml: string }[] = []

  // 実効デフォルト: 行デフォルト（優先）→ 列デフォルト
  // このデフォルトと一致する s= は省略可、空セルも省略可
  const effectiveDefault = (col: string): string | undefined =>
    rowDefaultStyle ?? colDefaults.get(colToIdx(col) + 1)

  const makeCellXml = (col: string, val: string | undefined, styleIdx: string | undefined): string => {
    const ref     = `${col}${rowNum}`
    const defStyle = effectiveDefault(col)
    const sStr    = (styleIdx && styleIdx !== defStyle) ? ` s="${styleIdx}"` : ''

    if (val !== undefined) {
      return `<c r="${ref}"${sStr} t="inlineStr"><is><t>${xmlEscape(val)}</t></is></c>`
    }
    if (styleIdx && styleIdx !== defStyle) {
      // 実効デフォルトと異なるスタイルの空セル → 明示的に書く（罫線・背景を保持）
      return `<c r="${ref}" s="${styleIdx}"/>`
    }
    // 実効デフォルトと同じ空セル → 省略（行/列デフォルトが自動適用）
    return ''
  }

  if (assigneeCol) {
    const xml = makeCellXml(assigneeCol, row.assignee || undefined, styleByCol.get(assigneeCol))
    if (xml) cells.push({ colIdx: colToIdx(assigneeCol), xml })
  }

  for (const f of EXPORT_FIELDS) {
    const col = headerTextToCol.get(f.header ?? f.key)
    if (!col) continue
    const xml = makeCellXml(col, exportFieldValue(row, f.key), styleByCol.get(col))
    if (xml) cells.push({ colIdx: colToIdx(col), xml })
  }

  if (cells.length === 0) return ''
  cells.sort((a, b) => a.colIdx - b.colIdx)

  const minCol     = cells[0].colIdx + 1
  const maxCol     = cells[cells.length - 1].colIdx + 1
  const extraAttrs = templateRowAttrs ? ` ${templateRowAttrs}` : ''

  return `<row r="${rowNum}" spans="${minCol}:${maxCol}"${extraAttrs}>${cells.map(c => c.xml).join('')}</row>`
}

// ── ワークブック内シートのパス解決 ──────────────────────────────────────────

async function resolveSheetPath(zip: JSZip, sheetName: string): Promise<string | null> {
  const wbXml = await zip.file('xl/workbook.xml')?.async('text')
  if (!wbXml) return null

  const escaped = sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sheetRe = new RegExp(
    `<sheet\\b[^>]*name="${escaped}"[^>]*r:id="([^"]+)"` +
    `|<sheet\\b[^>]*r:id="([^"]+)"[^>]*name="${escaped}"`
  )
  const sheetM = wbXml.match(sheetRe)
  if (!sheetM) return null
  const rId = sheetM[1] ?? sheetM[2]

  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text')
  if (!relsXml) return null

  const relM = relsXml.match(new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`))
  if (!relM) return null

  const target = relM[1]
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`
}

// ── ZIP の外科的書き換え（メイン処理）──────────────────────────────────────

export async function buildZipBuffer(
  origBuffer: ArrayBuffer,
  rows: AllocationRow[],
  onProgress?: (pct: number) => void,
): Promise<ArrayBuffer> {
  onProgress?.(5)
  const zip = await JSZip.loadAsync(origBuffer)

  const sheetPath = await resolveSheetPath(zip, EXPORT_SHEET_NAME)
  if (!sheetPath) throw new Error(`シート "${EXPORT_SHEET_NAME}" がワークブックに見つかりません`)

  const sheetFile = zip.file(sheetPath)
  if (!sheetFile) throw new Error(`シートファイルが見つかりません: ${sheetPath}`)

  onProgress?.(10)
  const ssXml         = await zip.file('xl/sharedStrings.xml')?.async('text') ?? ''
  const sharedStrings = parseSharedStrings(ssXml)
  const sheetXml      = await sheetFile.async('text')

  const sdMatch = sheetXml.match(/(<sheetData\b[^>]*>)([\s\S]*?)(<\/sheetData>)/)
  if (!sdMatch) throw new Error('sheetData 要素が見つかりません')

  const [fullSd, sdOpen, sdContent, sdClose] = sdMatch
  const sdStart  = sheetXml.indexOf(fullSd)
  const beforeSd = sheetXml.slice(0, sdStart)
  const afterSd  = sheetXml.slice(sdStart + fullSd.length)

  onProgress?.(15)
  const colDefaults = parseColDefaultStyles(beforeSd)

  const { rows: headRows, rowEndPositions } = parseHeadRows(sdContent, sharedStrings)

  // コンテンツベースで動的にヘッダー行を検出（固定行番号に依存しない）
  const headerInfo = findHeaderRow(headRows)
  if (!headerInfo) throw new Error(`ヘッダー行が見つかりません（先頭 ${MAX_HEAD_ROWS} 行以内に既知のヘッダー列がありません）`)

  const { idx: headerIdx, headerTextToCol } = headerInfo
  const headerRow      = headRows[headerIdx]
  const keepEndPos     = rowEndPositions[headerIdx]
  const firstDataRowNum = headerRow.rowNum + 1   // ヘッダー直後の行番号

  const knownHeaderCols = new Set(headerTextToCol.values())
  const assigneeCol     = !knownHeaderCols.has(START_COL) ? START_COL : null

  // テンプレート行 = ヘッダーの次の行（スタイル取得用）
  const templateRow = headRows[headerIdx + 1]
  const styleByCol  = new Map<string, string>()
  if (templateRow) {
    for (const cell of templateRow.cells) {
      if (cell.styleIdx) styleByCol.set(cell.col, cell.styleIdx)
    }
  }
  const templateRowAttrsSrc = templateRow?.xml.match(/<row\b([^>]*)>/)?.[1] ?? ''
  const templateRowAttrs    = templateRowAttrsSrc
    .replace(/\br="[^"]*"/, '')
    .replace(/\bspans="[^"]*"/, '')
    .trim()

  // 行デフォルトスタイル（customFormat="1" が設定されている行の s=）
  const rowDefaultStyle = (templateRowAttrsSrc.includes('customFormat="1"') || templateRowAttrsSrc.includes("customFormat='1'"))
    ? (templateRowAttrsSrc.match(/\bs="(\d+)"/)?.[1])
    : undefined

  onProgress?.(20)
  const keepXml = sdContent.slice(0, keepEndPos)

  const newDataXml = rows
    .map((row, idx) => buildDataRowXml(
      firstDataRowNum + idx, row, headerTextToCol, assigneeCol,
      styleByCol, colDefaults, rowDefaultStyle, templateRowAttrs,
    ))
    .filter(Boolean)
    .join('\n')

  onProgress?.(25)
  const lastRowNum  = rows.length > 0 ? firstDataRowNum + rows.length - 1 : headerRow.rowNum
  const allUsedCols = [...knownHeaderCols, ...(assigneeCol ? [assigneeCol] : [])]
  const endCol      = idxToCol(Math.max(...allUsedCols.map(colToIdx)))

  const dimRe    = /<dimension\b[^>]*ref="([A-Z]+\d+:[A-Z]+\d+)"[^>]*\/>/
  const origDimM = beforeSd.match(dimRe)
  const dimStart = origDimM ? origDimM[1].split(':')[0] : `${START_COL}1`

  const updatedBeforeSd = beforeSd.replace(dimRe, m =>
    m.replace(/ref="[^"]*"/, `ref="${dimStart}:${endCol}${lastRowNum}"`))

  zip.file(sheetPath, updatedBeforeSd + sdOpen + keepXml + '\n' + newDataXml + '\n' + sdClose + afterSd)

  // 30〜100% は generateAsync の圧縮進捗
  return zip.generateAsync(
    { type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    ({ percent }) => onProgress?.(30 + Math.round(percent * 0.7)),
  )
}
