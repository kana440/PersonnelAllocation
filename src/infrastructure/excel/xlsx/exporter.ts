// xlsx エクスポーター
// cellStyles: true + bookVBA: true で元ファイルを再読み込みし、
// セルの書式（color・罫線・フォント）と xlsm VBA マクロの保持を試みる。

import * as XLSX from 'xlsx'
import { ALLOCATION_LIST_FIELDS } from '../../../domain/csvImport/allocationList/labels'
import type { AllocationRow }     from '../../allocationListMapper'
import { getLastBuffer, getLastFileName } from '../state'

const EXPORT_SHEET_NAME = '要員配置リスト'
const EXPORT_FIELDS     = ALLOCATION_LIST_FIELDS.filter(f => f.key !== 'groupEmployeeId')

const HEADER_SET = new Set(ALLOCATION_LIST_FIELDS.map(f => (f.header ?? f.key).trim()))

function exportValue(row: AllocationRow, key: string): unknown {
  const val = (row as Record<string, unknown>)[key]
  if (key === 'positionCode') {
    const s = typeof val === 'string' ? val : ''
    return s.startsWith('_pos_') ? undefined : val
  }
  return val
}

function findHeaderRowIndex(raw: unknown[][]): number {
  let bestIdx = -1, bestScore = 1
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const row = raw[i]
    if (!Array.isArray(row)) continue
    const score = (row as unknown[]).filter(c => typeof c === 'string' && HEADER_SET.has((c as string).trim())).length
    if (score > bestScore) { bestScore = score; bestIdx = i }
  }
  return bestIdx
}

type CellStyle = XLSX.CellObject['s']

async function buildWorkbook(
  rows: AllocationRow[],
  effectiveDate: string,
  scopeName?: string,
): Promise<{ wb: XLSX.WorkBook; fileName: string; ext: string }> {
  const origBuffer   = getLastBuffer()
  const origFileName = getLastFileName()
  const baseName     = (origFileName ?? '発令一覧').replace(/\.[^.]+$/, '')
  const ext          = origFileName?.endsWith('.xlsm') ? 'xlsm' : 'xlsx'
  const scopeSuffix  = scopeName ? `_${scopeName.replace(/[/\\?*[\]:]/g, '_')}` : ''
  const fileName     = origBuffer ? `${baseName}${scopeSuffix}_${effectiveDate}.${ext}` : `発令一覧${scopeSuffix}_${effectiveDate}.xlsx`

  if (origBuffer) {
    const wb         = XLSX.read(origBuffer, { type: 'array', cellStyles: true, bookVBA: true })
    const origSheet  = wb.Sheets[EXPORT_SHEET_NAME]

    if (origSheet) {
      const raw          = XLSX.utils.sheet_to_json<unknown[]>(origSheet, { header: 1, defval: '' })
      const headerRowIdx = findHeaderRowIndex(raw)

      if (headerRowIdx >= 0) {
        const origHeaderRow   = raw[headerRowIdx] as unknown[]
        const ws: XLSX.WorkSheet = { ...origSheet }
        const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')

        // sheet_to_json の列インデックスは range.s.c 相対なので絶対列番号に変換して格納
        const headerTextToCol = new Map<string, number>()
        origHeaderRow.forEach((cell, relCol) => {
          const text = typeof cell === 'string' ? cell.trim() : ''
          if (text) headerTextToCol.set(text, range.s.c + relCol)
        })

        // 絶対行番号: sheet_to_json のインデックスは range.s.r 相対
        const absHeaderRow  = range.s.r + headerRowIdx
        const absFirstDataRow = absHeaderRow + 1

        // 最初のデータ行のスタイルをテンプレートとして保存（元行数超過の新規行用）
        const styleTemplate = new Map<number, CellStyle>()
        if (raw.length > headerRowIdx + 1) {
          for (const col of headerTextToCol.values()) {
            const s = origSheet[XLSX.utils.encode_cell({ r: absFirstDataRow, c: col })]?.s
            if (s) styleTemplate.set(col, s)
          }
        }

        // 担当者列の検出: A列 (col=0) が既知ヘッダー列でなければ担当者列とみなす
        // range.s.c > 0 の場合（データがB列以降から始まる）も col=0 を担当者列として扱う
        const knownCols = new Set(headerTextToCol.values())
        const assigneeCol = knownCols.has(0) ? -1 : 0

        // スタイルテンプレートに担当者列も追加
        if (assigneeCol >= 0 && raw.length > headerRowIdx + 1) {
          const s = origSheet[XLSX.utils.encode_cell({ r: absFirstDataRow, c: assigneeCol })]?.s
          if (s) styleTemplate.set(assigneeCol, s)
        }

        // データ行を削除（担当者列が範囲外の場合も含めてクリア）
        const deleteStartCol = assigneeCol >= 0 ? Math.min(assigneeCol, range.s.c) : range.s.c
        for (let r = absFirstDataRow; r <= range.e.r; r++) {
          for (let c = deleteStartCol; c <= range.e.c; c++) {
            delete ws[XLSX.utils.encode_cell({ r, c })]
          }
        }

        // 新データを書き込み（元セルの書式を転記、なければテンプレート使用）
        rows.forEach((row, idx) => {
          const r = absFirstDataRow + idx

          // 担当者列を書き込む
          if (assigneeCol >= 0 && row.assignee) {
            const style: CellStyle = origSheet[XLSX.utils.encode_cell({ r, c: assigneeCol })]?.s ?? styleTemplate.get(assigneeCol)
            ws[XLSX.utils.encode_cell({ r, c: assigneeCol })] = { v: row.assignee, t: 's', ...(style !== undefined ? { s: style } : {}) }
          }

          EXPORT_FIELDS.forEach(f => {
            const col = headerTextToCol.get(f.header ?? f.key)
            if (col === undefined) return
            const val = exportValue(row, f.key)
            if (val === undefined || val === null || val === '') return
            const style: CellStyle = origSheet[XLSX.utils.encode_cell({ r, c: col })]?.s ?? styleTemplate.get(col)
            ws[XLSX.utils.encode_cell({ r, c: col })] = { v: val, t: 's', ...(style !== undefined ? { s: style } : {}) }
          })
        })

        const lastDataRow  = rows.length > 0 ? absHeaderRow + rows.length : absHeaderRow
        const rangeStartCol = assigneeCol >= 0 ? Math.min(assigneeCol, range.s.c) : range.s.c
        ws['!ref'] = XLSX.utils.encode_range({ s: { r: range.s.r, c: rangeStartCol }, e: { r: lastDataRow, c: range.e.c } })
        wb.Sheets[EXPORT_SHEET_NAME] = ws
        return { wb, fileName, ext }
      }
    }

    // シートなし or ヘッダーなし → 既存WBに新規シートを追加
    const wb2 = XLSX.read(origBuffer, { type: 'array', cellStyles: true, bookVBA: true })
    if (!wb2.Sheets[EXPORT_SHEET_NAME]) {
      wb2.SheetNames = [EXPORT_SHEET_NAME, ...wb2.SheetNames]
      wb2.Sheets[EXPORT_SHEET_NAME] = buildFreshSheet(rows)
    }
    return { wb: wb2, fileName, ext }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildFreshSheet(rows), EXPORT_SHEET_NAME)
  return { wb, fileName, ext }
}

function buildFreshSheet(rows: AllocationRow[]): XLSX.WorkSheet {
  const META_KEYS = new Set(['no', 'userId', 'employeeNumber', 'lastName', 'firstName',
    'transferReason', 'memo', 'promotionSign', 'demotionReason', 'payGradeChangeSign'])
  const isAfterField = (key: string) => !key.startsWith('prev') && key !== 'exclusionReason' && !META_KEYS.has(key)

  const metaCount  = EXPORT_FIELDS.filter(f => META_KEYS.has(f.key)).length
  const afterCount = EXPORT_FIELDS.filter(f => isAfterField(f.key)).length
  const prevCount  = EXPORT_FIELDS.filter(f => f.key.startsWith('prev')).length
  const auditCount = EXPORT_FIELDS.length - metaCount - afterCount - prevCount

  const fill = (n: number) => Array(Math.max(0, n - 1)).fill('')
  // A列（担当者）を先頭に付加する
  const ws = XLSX.utils.aoa_to_sheet([
    ['', '本人情報 / 変更区分', ...fill(metaCount), 'After（発令後）', ...fill(afterCount), 'Before（発令前）', ...fill(prevCount), ...(auditCount > 0 ? ['除外', ...fill(auditCount)] : [])],
    ['', ...EXPORT_FIELDS.map(f => f.header ?? f.key)],
    ...rows.map(row => [row.assignee ?? '', ...EXPORT_FIELDS.map(f => exportValue(row, f.key) ?? '')]),
  ])
  ws['!cols'] = [
    { wch: 12 }, // 担当者列
    ...EXPORT_FIELDS.map(f =>
      ['no'].includes(f.key) ? { wch: 4 } :
      ['userId', 'employeeNumber'].includes(f.key) ? { wch: 12 } :
      ['lastName', 'firstName'].includes(f.key) ? { wch: 8 } :
      ['memo', 'concurrentReason', 'prevConcurrentReason'].includes(f.key) ? { wch: 20 } :
      { wch: 14 }
    ),
  ]
  return ws
}

export async function buildExportBuffer(
  rows: AllocationRow[],
  effectiveDate: string,
  scopeName?: string,
): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const { wb, fileName, ext } = await buildWorkbook(rows, effectiveDate, scopeName)
  const bookType = ext === 'xlsm' ? 'xlsm' : 'xlsx'
  return { buffer: XLSX.write(wb, { bookType, type: 'array' }) as ArrayBuffer, fileName }
}

export async function exportToXlsx(rows: AllocationRow[], effectiveDate: string, scopeName?: string): Promise<void> {
  const { buffer, fileName } = await buildExportBuffer(rows, effectiveDate, scopeName)
  const ext      = fileName.endsWith('.xlsm') ? 'xlsm' : 'xlsx'
  const mimeType = ext === 'xlsm' ? 'application/vnd.ms-excel.sheet.macroEnabled.12' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const blob = new Blob([buffer], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
