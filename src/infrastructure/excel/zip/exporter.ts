// ZIP-level Excel exporter
//
// 元 xlsm/xlsx をそのまま ZIP として保持し、
// データシートの XML だけを外科的に書き換える。
//
// 保持されるもの:
//   xl/workbook.xml       → 名前付き範囲
//   xl/styles.xml         → 全書式定義
//   xl/vbaProject.bin     → マクロ
//   xl/worksheets/sheet.xml のヘッダー以前 → 列幅・フリーズペイン・結合セル等
//
// 新規行は inline string で書き込み、
// 元の1行目データ行のセルスタイルインデックス（s 属性）を列ごとに引き継ぐ。

import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { ALLOCATION_LIST_FIELDS } from '../../../domain/csvImport/allocationList/labels'
import type { AllocationRow } from '../../allocationListMapper'
import { getLastBuffer, getLastFileName } from '../state'

const EXPORT_SHEET_NAME = '要員配置リスト'
const EXPORT_FIELDS     = ALLOCATION_LIST_FIELDS.filter(f => f.key !== 'groupEmployeeId')
const HEADER_SET        = new Set(ALLOCATION_LIST_FIELDS.map(f => (f.header ?? f.key).trim()))

// ── XML ヘルパー ──────────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 0-based 列インデックス → "A", "B", ... "Z", "AA", ...
function idxToCol(idx: number): string {
  let s = ''
  let n = idx + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// "A", "AB" → 0-based インデックス
function colToIdx(col: string): number {
  let n = 0
  for (const ch of col.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

// ── 共有文字列の解析 ──────────────────────────────────────────────────────────

function parseSharedStrings(xml: string): string[] {
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

// ── シート XML のパース ───────────────────────────────────────────────────────

interface CellInfo {
  col: string      // "A", "B", ...
  text: string     // 解決済みテキスト
  styleIdx: string // s 属性値（"" = なし）
}

interface RowInfo {
  rowNum: number
  xml: string
  cells: CellInfo[]
}

function parseCellXml(cellXml: string, sharedStrings: string[]): CellInfo {
  const refM  = cellXml.match(/\br="([A-Z]+)\d+"/)
  const typeM = cellXml.match(/\bt="([^"]+)"/)
  const styleM = cellXml.match(/\bs="(\d+)"/)
  const col       = refM?.[1] ?? ''
  const type      = typeM?.[1] ?? ''
  const styleIdx  = styleM?.[1] ?? ''

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

function parseSheetRows(sheetDataContent: string, sharedStrings: string[]): RowInfo[] {
  const rows: RowInfo[] = []
  // <row> 要素を抽出（自己終了 <row .../> にも対応）
  const rowRe = /(<row\b[^>]*r="(\d+)"[^>]*\/>)|(<row\b[^>]*r="(\d+)"[^>]*>)([\s\S]*?)(<\/row>)/g
  let m
  while ((m = rowRe.exec(sheetDataContent)) !== null) {
    if (m[1]) {
      // 自己終了行（空行）
      rows.push({ rowNum: parseInt(m[2]), xml: m[1], cells: [] })
    } else {
      const rowNum = parseInt(m[4])
      const innerXml = m[5]
      const cells: CellInfo[] = []
      const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g
      let c
      while ((c = cellRe.exec(innerXml)) !== null) {
        cells.push(parseCellXml(`<c ${c[1]}>${c[2]}</c>`, sharedStrings))
      }
      rows.push({ rowNum, xml: m[0], cells })
    }
  }
  return rows
}

// ── ヘッダー行の検出 ──────────────────────────────────────────────────────────

function findHeaderRow(rows: RowInfo[]): {
  rowIdx: number
  headerTextToCol: Map<string, string>  // ヘッダーテキスト → 列文字
} | null {
  let bestIdx = -1, bestScore = 1
  let bestMap = new Map<string, string>()

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    let score = 0
    const map = new Map<string, string>()
    for (const cell of rows[i].cells) {
      const h = cell.text.trim()
      if (HEADER_SET.has(h)) { score++; map.set(h, cell.col) }
    }
    if (score > bestScore) { bestScore = score; bestIdx = i; bestMap = map }
  }

  return bestIdx === -1 ? null : { rowIdx: bestIdx, headerTextToCol: bestMap }
}

// ── 新データ行の生成 ──────────────────────────────────────────────────────────

function exportFieldValue(row: AllocationRow, key: string): string | undefined {
  const val = (row as Record<string, unknown>)[key]
  if (key === 'positionCode') {
    const s = typeof val === 'string' ? val : ''
    return s.startsWith('_pos_') ? undefined : (val as string | undefined)
  }
  return (val !== undefined && val !== null && val !== '') ? String(val) : undefined
}

function buildDataRowXml(
  rowNum: number,
  row: AllocationRow,
  headerTextToCol: Map<string, string>,
  assigneeCol: string | null,
  styleByCol: Map<string, string>,   // 列文字 → スタイルインデックス
  templateRowAttrs: string,          // r= と spans= を除いた行属性文字列
): string {
  const cells: { col: string; colIdx: number; xml: string }[] = []

  if (assigneeCol && row.assignee) {
    const s    = styleByCol.get(assigneeCol)
    const sStr = s ? ` s="${s}"` : ''
    const ref  = `${assigneeCol}${rowNum}`
    cells.push({ col: assigneeCol, colIdx: colToIdx(assigneeCol),
      xml: `<c r="${ref}"${sStr} t="inlineStr"><is><t>${xmlEscape(row.assignee)}</t></is></c>` })
  }

  for (const f of EXPORT_FIELDS) {
    const col = headerTextToCol.get(f.header ?? f.key)
    if (!col) continue
    const val = exportFieldValue(row, f.key)
    if (val === undefined) continue
    const s    = styleByCol.get(col)
    const sStr = s ? ` s="${s}"` : ''
    const ref  = `${col}${rowNum}`
    cells.push({ col, colIdx: colToIdx(col),
      xml: `<c r="${ref}"${sStr} t="inlineStr"><is><t>${xmlEscape(val)}</t></is></c>` })
  }

  if (cells.length === 0) return ''
  cells.sort((a, b) => a.colIdx - b.colIdx)

  const minCol = cells[0].colIdx + 1
  const maxCol = cells[cells.length - 1].colIdx + 1
  const extraAttrs = templateRowAttrs ? ` ${templateRowAttrs}` : ''

  return `<row r="${rowNum}" spans="${minCol}:${maxCol}"${extraAttrs}>${cells.map(c => c.xml).join('')}</row>`
}

// ── ワークブック内シートのパス解決 ────────────────────────────────────────────

async function resolveSheetPath(zip: JSZip, sheetName: string): Promise<string | null> {
  const wbXml = await zip.file('xl/workbook.xml')?.async('text')
  if (!wbXml) return null

  // name="xxx" ... r:id="rIdN"  または r:id が先に来るケースも考慮
  const escaped = sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sheetRe = new RegExp(
    `<sheet\\b[^>]*name="${escaped}"[^>]*r:id="([^"]+)"` +
    `|<sheet\\b[^>]*r:id="([^"]+)"[^>]*name="${escaped}"`
  )
  const sheetM  = wbXml.match(sheetRe)
  if (!sheetM) return null
  const rId = sheetM[1] ?? sheetM[2]

  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text')
  if (!relsXml) return null

  const relRe = new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`)
  const relM  = relsXml.match(relRe)
  if (!relM) return null

  const target = relM[1]
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`
}

// ── ZIP を外科的に書き換えてバッファを生成 ────────────────────────────────────

async function buildZipBuffer(
  origBuffer: ArrayBuffer,
  rows: AllocationRow[],
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(origBuffer)

  // シートパスを解決
  const sheetPath = await resolveSheetPath(zip, EXPORT_SHEET_NAME)
  if (!sheetPath) throw new Error(`シート "${EXPORT_SHEET_NAME}" がワークブックに見つかりません`)

  const sheetFile = zip.file(sheetPath)
  if (!sheetFile) throw new Error(`シートファイルが見つかりません: ${sheetPath}`)

  // 共有文字列を解析
  const ssXml = await zip.file('xl/sharedStrings.xml')?.async('text') ?? ''
  const sharedStrings = parseSharedStrings(ssXml)

  // シート XML を読み込み
  const sheetXml = await sheetFile.async('text')

  // <sheetData> ブロックを抽出
  const sdMatch = sheetXml.match(/(<sheetData\b[^>]*>)([\s\S]*?)(<\/sheetData>)/)
  if (!sdMatch) throw new Error('sheetData 要素が見つかりません')

  const [fullSd, sdOpen, sdContent, sdClose] = sdMatch
  const beforeSd = sheetXml.slice(0, sheetXml.indexOf(fullSd))
  const afterSd  = sheetXml.slice(sheetXml.indexOf(fullSd) + fullSd.length)

  // 行をパース
  const parsedRows = parseSheetRows(sdContent, sharedStrings)

  // ヘッダー行を検出
  const headerInfo = findHeaderRow(parsedRows)
  if (!headerInfo) throw new Error('ヘッダー行が見つかりません（最初の10行以内に既知のヘッダー列がありません）')

  const { rowIdx: headerRowIdx, headerTextToCol } = headerInfo
  const headerRowNum  = parsedRows[headerRowIdx].rowNum
  const firstDataRowNum = headerRowNum + 1

  // 担当者列の検出
  const knownHeaderCols = new Set(headerTextToCol.values())
  const allCols = parsedRows[headerRowIdx].cells.map(c => c.col).sort((a, b) => colToIdx(a) - colToIdx(b))
  const firstCol      = allCols[0]
  const assigneeCol   = (firstCol && !knownHeaderCols.has(firstCol)) ? firstCol : null

  // テンプレート行（ヘッダー直後の最初のデータ行）からスタイルと行属性を取得
  const templateRow = parsedRows[headerRowIdx + 1]
  const styleByCol  = new Map<string, string>()
  if (templateRow) {
    for (const cell of templateRow.cells) {
      if (cell.styleIdx) styleByCol.set(cell.col, cell.styleIdx)
    }
  }
  const templateRowAttrsSrc = templateRow?.xml.match(/<row\b([^>]*)>/)?.[1] ?? ''
  const templateRowAttrs = templateRowAttrsSrc
    .replace(/\br="[^"]*"/, '')
    .replace(/\bspans="[^"]*"/, '')
    .trim()

  // ヘッダー行以前の XML を保持
  const keepXml = parsedRows.slice(0, headerRowIdx + 1).map(r => r.xml).join('\n')

  // 新データ行を生成
  const newDataXml = rows
    .map((row, idx) => buildDataRowXml(
      firstDataRowNum + idx, row, headerTextToCol, assigneeCol, styleByCol, templateRowAttrs
    ))
    .filter(Boolean)
    .join('\n')

  // <dimension ref> を更新
  const lastRowNum = rows.length > 0 ? firstDataRowNum + rows.length - 1 : headerRowNum
  const allUsedCols = [...knownHeaderCols, ...(assigneeCol ? [assigneeCol] : [])]
  const colIndices  = allUsedCols.map(colToIdx).sort((a, b) => a - b)
  const startCol    = colIndices.length > 0 ? idxToCol(colIndices[0]) : 'A'
  const endCol      = colIndices.length > 0 ? idxToCol(colIndices[colIndices.length - 1]) : 'A'

  const dimRe = /<dimension\b[^>]*ref="([A-Z]+\d+:[A-Z]+\d+)"[^>]*\/>/
  const origDimM = beforeSd.match(dimRe)
  const dimStartRef = origDimM
    ? origDimM[1].split(':')[0]          // 元の開始セル（A1 など）を維持
    : `${startCol}1`
  const newDim = `${dimStartRef}:${endCol}${lastRowNum}`

  const updatedBeforeSd = beforeSd.replace(dimRe, m =>
    m.replace(/ref="[^"]*"/, `ref="${newDim}"`))

  // 新しいシート XML を組み立て
  const newSheetXml = updatedBeforeSd + sdOpen + keepXml + '\n' + newDataXml + '\n' + sdClose + afterSd

  // ZIP を更新して生成
  zip.file(sheetPath, newSheetXml)

  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

// ── 公開 API ─────────────────────────────────────────────────────────────────

function buildFreshWorkbook(rows: AllocationRow[]): { wb: XLSX.WorkBook; ext: 'xlsx' } {
  const META_KEYS = new Set(['no', 'userId', 'employeeNumber', 'lastName', 'firstName',
    'transferReason', 'memo', 'promotionSign', 'demotionReason', 'payGradeChangeSign'])
  const isAfterField = (key: string) =>
    !key.startsWith('prev') && key !== 'exclusionReason' && !META_KEYS.has(key)

  const metaCount  = EXPORT_FIELDS.filter(f => META_KEYS.has(f.key)).length
  const afterCount = EXPORT_FIELDS.filter(f => isAfterField(f.key)).length
  const prevCount  = EXPORT_FIELDS.filter(f => f.key.startsWith('prev')).length
  const auditCount = EXPORT_FIELDS.length - metaCount - afterCount - prevCount
  const fill       = (n: number) => Array(Math.max(0, n - 1)).fill('')

  const ws = XLSX.utils.aoa_to_sheet([
    ['', '本人情報 / 変更区分', ...fill(metaCount), 'After（発令後）', ...fill(afterCount),
     'Before（発令前）', ...fill(prevCount), ...(auditCount > 0 ? ['除外', ...fill(auditCount)] : [])],
    ['', ...EXPORT_FIELDS.map(f => f.header ?? f.key)],
    ...rows.map(row => [row.assignee ?? '', ...EXPORT_FIELDS.map(f => exportFieldValue(row, f.key) ?? '')]),
  ])
  ws['!cols'] = [
    { wch: 12 },
    ...EXPORT_FIELDS.map(f =>
      f.key === 'no' ? { wch: 4 } :
      ['userId', 'employeeNumber'].includes(f.key) ? { wch: 12 } :
      ['lastName', 'firstName'].includes(f.key) ? { wch: 8 } :
      ['memo', 'concurrentReason', 'prevConcurrentReason'].includes(f.key) ? { wch: 20 } :
      { wch: 14 }
    ),
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, EXPORT_SHEET_NAME)
  return { wb, ext: 'xlsx' }
}

export async function buildExportBuffer(
  rows: AllocationRow[],
  effectiveDate: string,
  scopeName?: string,
): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const origBuffer   = getLastBuffer()
  const origFileName = getLastFileName()
  const baseName     = (origFileName ?? '発令一覧').replace(/\.[^.]+$/, '')
  const ext          = origFileName?.endsWith('.xlsm') ? 'xlsm' : 'xlsx'
  const scopeSuffix  = scopeName ? `_${scopeName.replace(/[/\\?*[\]:]/g, '_')}` : ''
  const fileName     = origBuffer
    ? `${baseName}${scopeSuffix}_${effectiveDate}.${ext}`
    : `発令一覧${scopeSuffix}_${effectiveDate}.xlsx`

  if (origBuffer) {
    const buffer = await buildZipBuffer(origBuffer, rows)
    return { buffer, fileName }
  }

  // 元ファイルなし → シンプルな xlsx を新規生成（SheetJS はフレッシュ xlsx なら互換問題なし）
  const { wb } = buildFreshWorkbook(rows)
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return { buffer, fileName }
}

export async function exportToXlsx(
  rows: AllocationRow[],
  effectiveDate: string,
  scopeName?: string,
): Promise<void> {
  const { buffer, fileName } = await buildExportBuffer(rows, effectiveDate, scopeName)
  const mimeType = fileName.endsWith('.xlsm')
    ? 'application/vnd.ms-excel.sheet.macroEnabled.12'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const blob = new Blob([buffer], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
