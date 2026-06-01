// ZIP エクスポートの純粋処理（DOM・state への依存なし）
// exporter.ts と zipWorker.ts の両方からインポートされる。

import JSZip from 'jszip'
import { ALLOCATION_LIST_FIELDS } from '../../../domain/csvImport/allocationList/labels'
import type { AllocationRow } from '../../allocationListMapper'

// ── 列レイアウト（labels.ts の定義順 = 列順）────────────────────────────────
//
//   A列       : 担当者（ASSIGNEE_COL 固定）
//   B列以降   : ALLOCATION_LIST_FIELDS の並び順
//
// ヘッダー名によるマッチングは行わない。labels.ts を変更したら列順も変わる。

export const EXPORT_SHEET_NAME = '要員配置リスト'
export const EXPORT_FIELDS     = ALLOCATION_LIST_FIELDS
const DATA_START                = 5    // データ開始行（A列5行目）
const ASSIGNEE_COL              = 'A'  // A列 = 担当者（固定）

// EXPORT_FIELDS[0] → 'B', [1] → 'C', ... (A列は担当者で埋まっているため idx+1)
const FIELD_KEY_TO_COL: ReadonlyMap<string, string> = new Map(
  EXPORT_FIELDS.map((f, idx) => [f.key, idxToCol(idx + 1)])
)

// ── XML ヘルパー ─────────────────────────────────────────────────────────────

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

function colToIdx(col: string): number {
  let n = 0
  for (const ch of col.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

// ── 列デフォルトスタイルの解析 ───────────────────────────────────────────────

// <cols> から 列番号(1-based) → デフォルトスタイルインデックス を生成
function parseColDefaultStyles(beforeSheetData: string): Map<number, string> {
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

// ── データ境界の検出とテンプレート行スタイルの取得 ──────────────────────────
//
// DATA_START 行を見つけて：
//   keepEndPos       : その行の直前オフセット（ここまでのXMLを保持）
//   styleByCol       : その行のセルスタイル（列文字 → スタイルインデックス）
//   templateRowAttrs : 新規行に引き継ぐ行属性（高さ・customFormat等）
//   rowDefaultStyle  : 行デフォルトスタイル（customFormat="1" 時の s=）

interface DataBoundary {
  keepEndPos: number
  styleByCol: Map<string, string>
  templateRowAttrs: string
  rowDefaultStyle: string | undefined
}

function findDataBoundary(sheetDataContent: string): DataBoundary {
  const rowRe = /(<row\b[^>]*r="(\d+)"[^>]*\/>)|(<row\b[^>]*r="(\d+)"[^>]*>)([\s\S]*?)(<\/row>)/g
  let m

  while ((m = rowRe.exec(sheetDataContent)) !== null) {
    const rowNum = m[1] ? parseInt(m[2]) : parseInt(m[4])
    if (rowNum < DATA_START) continue

    const keepEndPos = m.index  // DATA_START 行の直前まで保持

    const rowAttrSrc = m[0].match(/<row\b([^>]*)>/)?.[1] ?? ''
    const templateRowAttrs = rowAttrSrc
      .replace(/\br="[^"]*"/, '')
      .replace(/\bspans="[^"]*"/, '')
      .replace(/\bht="[^"]*"/, '')           // 行高さは除去（シートデフォルトを継承）
      .replace(/\bcustomHeight="[^"]*"/, '') // 高さ指定フラグも除去
      .trim()
    const rowDefaultStyle  = (rowAttrSrc.includes('customFormat="1"') || rowAttrSrc.includes("customFormat='1'"))
      ? rowAttrSrc.match(/\bs="(\d+)"/)?.[1]
      : undefined

    // セルから s= 属性だけを抽出（テキスト解決は不要）
    const styleByCol = new Map<string, string>()
    if (!m[1]) {
      const cellAttrRe = /<c\b([^>]*?)(?:\/|>)/g
      let c
      while ((c = cellAttrRe.exec(m[5])) !== null) {
        const refM   = c[1].match(/\br="([A-Z]+)\d+"/)
        const styleM = c[1].match(/\bs="(\d+)"/)
        if (refM?.[1] && styleM?.[1]) styleByCol.set(refM[1], styleM[1])
      }
    }

    return { keepEndPos, styleByCol, templateRowAttrs, rowDefaultStyle }
  }

  // DATA_START 以降の行が存在しない（空ファイル等）
  return { keepEndPos: sheetDataContent.length, styleByCol: new Map(), templateRowAttrs: '', rowDefaultStyle: undefined }
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

function buildDataRowXml(
  rowNum: number,
  row: AllocationRow,
  styleByCol: Map<string, string>,
  colDefaults: Map<number, string>,
  rowDefaultStyle: string | undefined,
  templateRowAttrs: string,
): string {
  const cells: { colIdx: number; xml: string }[] = []

  // 実効デフォルト: 行デフォルト（優先）→ 列デフォルト
  const effectiveDefault = (col: string): string | undefined =>
    rowDefaultStyle ?? colDefaults.get(colToIdx(col) + 1)

  const makeCellXml = (col: string, val: string | undefined, styleIdx: string | undefined): string => {
    const ref      = `${col}${rowNum}`
    const defStyle = effectiveDefault(col)
    const sStr     = (styleIdx && styleIdx !== defStyle) ? ` s="${styleIdx}"` : ''

    if (val !== undefined) {
      return `<c r="${ref}"${sStr} t="inlineStr"><is><t>${xmlEscape(val)}</t></is></c>`
    }
    if (styleIdx && styleIdx !== defStyle) {
      return `<c r="${ref}" s="${styleIdx}"/>`
    }
    return ''
  }

  // A列: 担当者
  const assigneeXml = makeCellXml(ASSIGNEE_COL, row.assignee || undefined, styleByCol.get(ASSIGNEE_COL))
  if (assigneeXml) cells.push({ colIdx: colToIdx(ASSIGNEE_COL), xml: assigneeXml })

  // B列以降: labels.ts の定義順（= FIELD_KEY_TO_COL）
  for (const f of EXPORT_FIELDS) {
    const col = FIELD_KEY_TO_COL.get(f.key)!
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
  const sheetXml = await sheetFile.async('text')

  const sdMatch = sheetXml.match(/(<sheetData\b[^>]*>)([\s\S]*?)(<\/sheetData>)/)
  if (!sdMatch) throw new Error('sheetData 要素が見つかりません')

  const [fullSd, sdOpen, sdContent, sdClose] = sdMatch
  const sdStart  = sheetXml.indexOf(fullSd)
  const beforeSd = sheetXml.slice(0, sdStart)
  const afterSd  = sheetXml.slice(sdStart + fullSd.length)

  onProgress?.(15)
  const colDefaults = parseColDefaultStyles(beforeSd)
  const { keepEndPos, styleByCol, templateRowAttrs, rowDefaultStyle } = findDataBoundary(sdContent)

  onProgress?.(20)
  const keepXml    = sdContent.slice(0, keepEndPos)
  const newDataXml = rows
    .map((row, idx) => buildDataRowXml(
      DATA_START + idx, row, styleByCol, colDefaults, rowDefaultStyle, templateRowAttrs,
    ))
    .filter(Boolean)
    .join('\n')

  onProgress?.(25)
  // 最終列 = A列(担当者) + EXPORT_FIELDS 数
  const endCol     = idxToCol(EXPORT_FIELDS.length)
  const lastRowNum = rows.length > 0 ? DATA_START + rows.length - 1 : DATA_START - 1

  const dimRe    = /<dimension\b[^>]*ref="([A-Z]+\d+:[A-Z]+\d+)"[^>]*\/>/
  const origDimM = beforeSd.match(dimRe)
  const dimStart = origDimM ? origDimM[1].split(':')[0] : 'A1'

  const updatedBeforeSd = beforeSd.replace(dimRe, m =>
    m.replace(/ref="[^"]*"/, `ref="${dimStart}:${endCol}${lastRowNum}"`))

  zip.file(sheetPath, updatedBeforeSd + sdOpen + keepXml + '\n' + newDataXml + '\n' + sdClose + afterSd)

  return zip.generateAsync(
    { type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    ({ percent }) => onProgress?.(30 + Math.round(percent * 0.7)),
  )
}
