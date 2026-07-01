import ExcelJS from 'exceljs'
import { EMPTY_MASTERS }       from '@personnel/domain/masters/aggregate'
import type { AllocationRow }     from '@personnel/domain/allocationRow'
import type { Organization }      from '@personnel/domain/schemas'
import type { OrgMasterEntry }    from '@personnel/domain/masters/orgMaster'
import { setLastWorkbook }        from '../state'
import { SHEET_ALLOCATION, SHEET_MASTERS, SHEET_ORG_MASTER, SHEET_ORG_MASTER_OLD, SHEET_COMPANY } from '../sheetNames'
import type { ImportedWorkbookResult, ProgressCallback } from '../types'
import { tick }                   from '../types'
import { parseOrgMasterRaw, orgMasterToEntities } from '../shared/orgMasterParser'
import { parseAllocationSheet }   from '../shared/allocationParser'
import { parseMastersFromSheet, parseCompanySheet } from '../../masters/parser'
import { extractPhoneticMap }     from '../shared/phoneticExtractor'

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
  rawBuffer?: ArrayBuffer,
): Promise<ImportedWorkbookResult> {
  const report = async (msg: string) => { onProgress?.(msg); await tick() }

  const sheetsFound:  string[] = []
  const sheetsMissing: string[] = []

  let masters = EMPTY_MASTERS
  let masterCompatibilityWarnings: ImportedWorkbookResult['masterCompatibilityWarnings'] = []
  const columnWarnings: ImportedWorkbookResult['columnWarnings'] = []
  if (wb.getWorksheet(SHEET_MASTERS)) {
    await report('コードリスト（各種TBL）を解析中...')
    sheetsFound.push(SHEET_MASTERS)
    const result = parseMastersFromSheet(worksheetToRaw(wb.getWorksheet(SHEET_MASTERS)!))
    masters = { ...EMPTY_MASTERS, ...result.lists }
    masterCompatibilityWarnings = result.compatibilityWarnings
    columnWarnings.push(...result.columnWarnings)
  } else { sheetsMissing.push(SHEET_MASTERS) }

  let orgEntries: OrgMasterEntry[] = [], oldOrgEntries: OrgMasterEntry[] = []
  let beforeOrganizations: Organization[] = [], afterOrganizations: Organization[] = []

  if (wb.getWorksheet(SHEET_ORG_MASTER)) {
    await report('新組織マスタ（組織CD一覧）を解析中...')
    sheetsFound.push(SHEET_ORG_MASTER)
    const orgResult = parseOrgMasterRaw(worksheetToRaw(wb.getWorksheet(SHEET_ORG_MASTER)!), SHEET_ORG_MASTER, 'after')
    orgEntries = orgResult.entries
    columnWarnings.push(...orgResult.columnWarnings)
  } else { sheetsMissing.push(SHEET_ORG_MASTER) }

  if (wb.getWorksheet(SHEET_ORG_MASTER_OLD)) {
    await report('旧組織マスタ（旧組織CD一覧）を解析中...')
    sheetsFound.push(SHEET_ORG_MASTER_OLD)
    const orgResult = parseOrgMasterRaw(worksheetToRaw(wb.getWorksheet(SHEET_ORG_MASTER_OLD)!), SHEET_ORG_MASTER_OLD, 'before')
    oldOrgEntries = orgResult.entries
    columnWarnings.push(...orgResult.columnWarnings)
  }

  if (orgEntries.length > 0 || oldOrgEntries.length > 0) {
    const entities = orgMasterToEntities(orgEntries, oldOrgEntries, fallbackCompanyName)
    beforeOrganizations = entities.beforeOrganizations
    afterOrganizations  = entities.afterOrganizations
    masters = { ...masters, orgMasterEntries: [...orgEntries, ...oldOrgEntries] }
  }

  if (wb.getWorksheet(SHEET_COMPANY)) {
    await report('会社マスタ（会社CD一覧）を解析中...')
    sheetsFound.push(SHEET_COMPANY)
    masters = { ...masters, companies: parseCompanySheet(worksheetToRaw(wb.getWorksheet(SHEET_COMPANY)!)) }
  } else { sheetsMissing.push(SHEET_COMPANY) }

  let allocationList: AllocationRow[] = []
  if (wb.getWorksheet(SHEET_ALLOCATION)) {
    await report('要員配置リストを解析中...')
    sheetsFound.push(SHEET_ALLOCATION)
    const allocResult = parseAllocationSheet(worksheetToRaw(wb.getWorksheet(SHEET_ALLOCATION)!))
    columnWarnings.push(...allocResult.columnWarnings)
    await report(`要員配置リストを処理中... (${allocResult.rows.length} 行)`)

    // ふりがなマップを構築（VBAマクロで付与済みの場合に取得できる）
    const phoneticMap = rawBuffer ? await extractPhoneticMap(rawBuffer) : new Map<string, string>()

    allocationList = allocResult.rows.map((row, idx) => ({
      ...row,
      // ふりがなは Excel 列定義なし。VBA マクロで付与された rPh 要素から補完する
      lastNameKana:  row.lastName  ? phoneticMap.get(row.lastName)  : undefined,
      firstNameKana: row.firstName ? phoneticMap.get(row.firstName) : undefined,
      rowId: idx + 1,
    }))
  } else { sheetsMissing.push(SHEET_ALLOCATION) }

  return { masters, beforeOrganizations, afterOrganizations, allocationList, sheetsFound, sheetsMissing, orgEntries, oldOrgEntries, allocationRowCount: allocationList.length, masterCompatibilityWarnings, columnWarnings }
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
        resolve(await importWorkbook(wb, companyName, onProgress, data))
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
  const magic = new Uint8Array(buffer, 0, 2)
  if (magic[0] !== 0x50 || magic[1] !== 0x4B) {
    throw new Error(`ファイルが見つかりません: ${url}`)
  }
  setLastWorkbook(buffer, url.split('/').pop() ?? 'import.xlsx')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return importWorkbook(wb, undefined, onProgress, buffer)
}
