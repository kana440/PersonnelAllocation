import ExcelJS from 'exceljs'
import { ALLOCATION_LIST_FIELDS } from '@personnel/domain/csvImport/allocationList/labels'
import type { AllocationRow }     from '../../allocationListMapper'
import { getLastBuffer, getLastFileName } from '../state'

const EXPORT_SHEET_NAME = '要員配置リスト'
const EXPORT_FIELDS     = ALLOCATION_LIST_FIELDS

function exportValue(row: AllocationRow, key: string): unknown {
  const val = (row as Record<string, unknown>)[key]
  if (key === 'positionCode') {
    const s = typeof val === 'string' ? val : ''
    return s.startsWith('_pos_') ? undefined : val
  }
  return val
}

function findHeaderRowIndex(ws: ExcelJS.Worksheet): number {
  const headerSet = new Set(ALLOCATION_LIST_FIELDS.map(f => (f.header ?? f.key).trim()))
  let bestIdx = -1, bestScore = 1
  for (let i = 1; i <= Math.min(10, ws.rowCount); i++) {
    let score = 0
    ws.getRow(i).eachCell({ includeEmpty: false }, cell => {
      if (headerSet.has(cell.text.trim())) score++
    })
    if (score > bestScore) { bestScore = score; bestIdx = i - 1 }
  }
  return bestIdx
}

async function buildWorkbook(
  rows: AllocationRow[],
  effectiveDate: string,
  scopeName?: string,
): Promise<{ wb: ExcelJS.Workbook; fileName: string }> {
  const origBuffer   = getLastBuffer()
  const origFileName = getLastFileName()
  const baseName     = (origFileName ?? '発令一覧').replace(/\.[^.]+$/, '')
  const ext          = origFileName?.endsWith('.xlsm') ? 'xlsm' : 'xlsx'
  const scopeSuffix  = scopeName ? `_${scopeName.replace(/[/\\?*[\]:]/g, '_')}` : ''
  const fileName     = origBuffer ? `${baseName}${scopeSuffix}_${effectiveDate}.${ext}` : `発令一覧${scopeSuffix}_${effectiveDate}.xlsx`

  const wb = new ExcelJS.Workbook()

  if (origBuffer) {
    await wb.xlsx.load(origBuffer)
    const ws = wb.getWorksheet(EXPORT_SHEET_NAME)
    if (ws) {
      const headerRowIdx = findHeaderRowIndex(ws)
      if (headerRowIdx >= 0) {
        const headerExcelRow = headerRowIdx + 1
        const headerTextToCol = new Map<string, number>()
        ws.getRow(headerExcelRow).eachCell({ includeEmpty: false }, (cell, col) => {
          const text = cell.text.trim()
          if (text) headerTextToCol.set(text, col)
        })
        for (let r = headerExcelRow + 1; r <= ws.rowCount; r++) {
          ws.getRow(r).eachCell({ includeEmpty: false }, cell => { cell.value = null })
        }
        rows.forEach((row, idx) => {
          const excelRow = ws.getRow(headerExcelRow + 1 + idx)
          EXPORT_FIELDS.forEach(f => {
            const col = headerTextToCol.get(f.header ?? f.key)
            if (!col) return
            const val = exportValue(row, f.key)
            excelRow.getCell(col).value = (val !== undefined && val !== null && val !== '') ? String(val) : null
          })
          excelRow.commit()
        })
        return { wb, fileName }
      }
    }
    addFreshSheet(wb, rows)
    return { wb, fileName }
  }

  addFreshSheet(wb, rows)
  return { wb, fileName }
}

function addFreshSheet(wb: ExcelJS.Workbook, rows: AllocationRow[]): void {
  const META_KEYS = new Set(['no', 'userId', 'employeeNumber', 'lastName', 'firstName',
    'transferReason', 'memo', 'promotionSign', 'demotionReason', 'payGradeChangeSign'])
  const isAfterField = (key: string) => !key.startsWith('prev') && key !== 'exclusionReason' && !META_KEYS.has(key)

  const metaCount  = EXPORT_FIELDS.filter(f => META_KEYS.has(f.key)).length
  const afterCount = EXPORT_FIELDS.filter(f => isAfterField(f.key)).length
  const prevCount  = EXPORT_FIELDS.filter(f => f.key.startsWith('prev')).length
  const auditCount = EXPORT_FIELDS.length - metaCount - afterCount - prevCount

  const fill = (n: number) => Array(Math.max(0, n - 1)).fill('')
  const ws = wb.addWorksheet(EXPORT_SHEET_NAME)
  ws.addRow(['本人情報 / 変更区分', ...fill(metaCount), 'After（発令後）', ...fill(afterCount), 'Before（発令前）', ...fill(prevCount), ...(auditCount > 0 ? ['除外', ...fill(auditCount)] : [])])
  ws.addRow(EXPORT_FIELDS.map(f => f.header ?? f.key))
  rows.forEach(row => ws.addRow(EXPORT_FIELDS.map(f => exportValue(row, f.key) ?? '')))
  EXPORT_FIELDS.forEach((f, i) => {
    const col = ws.getColumn(i + 1)
    col.width = ['no'].includes(f.key) ? 4 : ['userId', 'employeeNumber'].includes(f.key) ? 12 : ['lastName', 'firstName'].includes(f.key) ? 8 : ['memo', 'concurrentReason', 'prevConcurrentReason'].includes(f.key) ? 20 : 14
  })
}

export async function buildExportBuffer(
  rows: AllocationRow[],
  effectiveDate: string,
  scopeName?: string,
): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const { wb, fileName } = await buildWorkbook(rows, effectiveDate, scopeName)
  return { buffer: await wb.xlsx.writeBuffer() as ArrayBuffer, fileName }
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
