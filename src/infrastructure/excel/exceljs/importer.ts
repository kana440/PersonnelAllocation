import ExcelJS from 'exceljs'
import { EMPTY_CODE_LISTS }       from '../../../domain/codeLists/aggregate'
import type { AllocationRow }     from '../../../domain/allocationRow'
import type { Organization }      from '../../../domain/schemas'
import type { OrgMasterEntry }    from '../../../domain/codeLists/orgMaster'
import { setLastWorkbook }        from '../state'
import { SHEET_ALLOCATION, SHEET_CODE_LISTS, SHEET_ORG_MASTER } from '../sheetNames'
import type { ImportedWorkbookResult, ProgressCallback } from '../types'
import { tick }                   from '../types'
import { parseOrgMasterRaw, orgMasterToEntities } from '../shared/orgMasterParser'
import { parseAllocationSheet }   from '../shared/allocationParser'
import { parseCodeListsFromSheet } from '../../codeLists/parser'

// ExcelJS セル値 → unknown（number/boolean 型を保持）
function rawCellValue(v: ExcelJS.CellValue | undefined): unknown {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map(rt => rt.text).join('')
    if ('formula'  in v) return (v as ExcelJS.CellFormulaValue).result ?? ''
  }
  return String(v)
}

function worksheetToRaw(ws: ExcelJS.Worksheet): unknown[][] {
  const result: unknown[][] = []
  for (let r = 1; r <= ws.rowCount; r++) {
    const values = ws.getRow(r).values as (ExcelJS.CellValue | undefined)[]
    const arr: unknown[] = []
    for (let i = 1; i < values.length; i++) arr.push(rawCellValue(values[i]))
    result.push(arr)
  }
  return result
}

export async function importWorkbook(
  wb: ExcelJS.Workbook,
  fallbackCompanyName = 'インポートデータ',
  onProgress?: ProgressCallback,
): Promise<ImportedWorkbookResult> {
  const report = async (msg: string) => { onProgress?.(msg); await tick() }

  const sheetsFound:  string[] = []
  const sheetsMissing: string[] = []

  let codeLists = EMPTY_CODE_LISTS
  if (wb.getWorksheet(SHEET_CODE_LISTS)) {
    await report('コードリスト（各種TBL）を解析中...')
    sheetsFound.push(SHEET_CODE_LISTS)
    const result = parseCodeListsFromSheet(worksheetToRaw(wb.getWorksheet(SHEET_CODE_LISTS)!))
    codeLists = { ...EMPTY_CODE_LISTS, ...result.lists }
  } else { sheetsMissing.push(SHEET_CODE_LISTS) }

  let orgEntries: OrgMasterEntry[] = [], beforeOrganizations: Organization[] = [], afterOrganizations: Organization[] = []
  if (wb.getWorksheet(SHEET_ORG_MASTER)) {
    await report('組織マスタ（組織CD一覧）を解析中...')
    sheetsFound.push(SHEET_ORG_MASTER)
    orgEntries = parseOrgMasterRaw(worksheetToRaw(wb.getWorksheet(SHEET_ORG_MASTER)!))
    const entities = orgMasterToEntities(orgEntries, fallbackCompanyName)
    beforeOrganizations = entities.beforeOrganizations
    afterOrganizations  = entities.afterOrganizations
    codeLists = { ...codeLists, orgMasterEntries: orgEntries }
  } else { sheetsMissing.push(SHEET_ORG_MASTER) }

  let allocationList: AllocationRow[] = []
  if (wb.getWorksheet(SHEET_ALLOCATION)) {
    await report('要員配置リストを解析中...')
    sheetsFound.push(SHEET_ALLOCATION)
    const rawRows = parseAllocationSheet(worksheetToRaw(wb.getWorksheet(SHEET_ALLOCATION)!))
    await report(`要員配置リストを処理中... (${rawRows.length} 行)`)
    allocationList = rawRows.map((row, idx) => ({ ...row, rowId: idx + 1 }))
  } else { sheetsMissing.push(SHEET_ALLOCATION) }

  return { codeLists, beforeOrganizations, afterOrganizations, allocationList, sheetsFound, sheetsMissing, orgEntries, allocationRowCount: allocationList.length }
}

export function importFromFile(file: File, onProgress?: ProgressCallback): Promise<ImportedWorkbookResult> {
  return new Promise((resolve, reject) => {
    onProgress?.('ファイルを読み込み中...')
    const reader = new FileReader()
    reader.onload = async e => {
      try {
        const data = e.target?.result as ArrayBuffer
        if (!data) throw new Error('ファイルの読み込みに失敗しました')
        onProgress?.('Excelを解析中...')
        await tick()
        setLastWorkbook(data, file.name)
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(data)
        const companyName = file.name.replace(/\.[^.]+$/, '').replace(/[_\-]?要員配置.*$/i, '').trim() || 'インポートデータ'
        resolve(await importWorkbook(wb, companyName, onProgress))
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'))
    reader.readAsArrayBuffer(file)
  })
}

export async function importFromUrl(url: string, onProgress?: ProgressCallback): Promise<ImportedWorkbookResult> {
  onProgress?.('ファイルを取得中...')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ファイルが見つかりません (${res.status}): ${url}`)
  onProgress?.('Excelを解析中...')
  await tick()
  const buffer = await res.arrayBuffer()
  setLastWorkbook(buffer, url.split('/').pop() ?? 'import.xlsx')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return importWorkbook(wb, undefined, onProgress)
}
