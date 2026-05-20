// 要員配置リスト Excel の統合インポーター
// 以下の3シートを1ファイルから読み取る:
//   "要員配置リスト" — AllocationList rows → Person / Position / Affiliation
//   "各種TBL"        — コードリスト (AllCodeLists)
//   "組織CD一覧"      — 組織マスタ (OrgMasterEntry[] → Organization[])

import * as XLSX from 'xlsx'
import type { AllCodeLists }        from '../domain/codeLists/aggregate'
import type { OrgMasterEntry }      from '../domain/codeLists/orgMaster'
import type { Organization, Company } from '../types/domain'
import { parseCodeListsFromWorkbook } from './codeLists/excelParser'
import { EMPTY_CODE_LISTS }          from '../domain/codeLists/aggregate'
import { ALLOCATION_LIST_FIELDS }    from '../domain/csvImport/allocationList/labels'
import type { AllocationList }       from '../domain/csvImport/allocationList/schema'
import type { AllocationRow }        from '../domain/allocationRow'

// ── シート名定数 ────────────────────────────────────────────────────────────────
export const SHEET_ALLOCATION = '要員配置リスト'
export const SHEET_CODE_LISTS = '各種TBL'
export const SHEET_ORG_MASTER = '組織CD一覧'

// ── 列インデックス変換 (A=0, B=1 …) ──────────────────────────────────────────
function colIdx(letter: string): number {
  let n = 0
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function cellStr(ws: XLSX.WorkSheet, r: number, c: number): string {
  return String(ws[XLSX.utils.encode_cell({ r, c })]?.v ?? '').trim()
}

function cellNum(ws: XLSX.WorkSheet, r: number, c: number): number {
  const v = ws[XLSX.utils.encode_cell({ r, c })]?.v
  return typeof v === 'number' ? v : (Number(String(v ?? '')) || 0)
}

// ── 組織CD一覧パーサー ─────────────────────────────────────────────────────────
// ヘッダー行のキーワードから列インデックスを自動検出する。
// 新列: 会社コード / 会社名 / 発令区分（前後フラグ）を追加サポート。
function parseOrgMaster(ws: XLSX.WorkSheet): OrgMasterEntry[] {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  const entries: OrgMasterEntry[] = []

  type ColMap = {
    code: number; parent: number; name: number
    companyCode: number; companyName: number; phase: number
    bu: number; div: number; dept: number; group: number; team: number; level: number
  }
  const defaults: ColMap = {
    code: colIdx('B'), parent: -1, name: -1,
    companyCode: -1, companyName: -1, phase: -1,
    bu: colIdx('C'), div: colIdx('D'), dept: colIdx('E'),
    group: colIdx('F'), team: colIdx('G'), level: colIdx('H'),
  }
  let colMap = { ...defaults }
  let dataStartRow = 1

  outer: for (let r = 0; r <= Math.min(4, range.e.r); r++) {
    const cm: ColMap = { ...defaults }
    let hits = 0
    for (let c = 0; c <= Math.min(range.e.c, 30); c++) {
      const h = String(ws[XLSX.utils.encode_cell({ r, c })]?.v ?? '').replace(/\s/g, '')
      if (!h) continue
      if (/上位組織コード|上位コード|親組織コード|親コード/.test(h))  { cm.parent      = c; hits++ }
      else if (/会社コード|会社ID|CompanyCode/i.test(h))              { cm.companyCode = c; hits++ }
      else if (/会社名|^会社$|CompanyName/i.test(h))                  { cm.companyName = c; hits++ }
      else if (/発令区分|前後フラグ|フェーズ|適用区分|Phase/i.test(h)) { cm.phase       = c; hits++ }
      else if (/^組織コード$|^コード$/.test(h))                        { cm.code        = c; hits++ }
      else if (/組織名|名称/.test(h))                                   { cm.name        = c; hits++ }
      else if (/組織レベル|レベル/.test(h))                             { cm.level       = c; hits++ }
      else if (/ビジネスユニット|BU/.test(h))                           { cm.bu          = c; hits++ }
      else if (/^部門$/.test(h))                                        { cm.div         = c; hits++ }
      else if (/統括部/.test(h))                                        { cm.dept        = c; hits++ }
      else if (/グループ/.test(h))                                      { cm.group       = c; hits++ }
      else if (/チーム/.test(h))                                        { cm.team        = c; hits++ }
    }
    if (hits >= 2) { colMap = cm; dataStartRow = r + 1; break outer }
  }

  for (let r = dataStartRow; r <= range.e.r; r++) {
    const code = cellStr(ws, r, colMap.code)
    if (!code) continue
    entries.push({
      code,
      parentCode:        colMap.parent      >= 0 ? (cellStr(ws, r, colMap.parent)      || undefined) : undefined,
      name:              colMap.name        >= 0 ? (cellStr(ws, r, colMap.name)         || undefined) : undefined,
      companyCode:       colMap.companyCode >= 0 ? (cellStr(ws, r, colMap.companyCode)  || undefined) : undefined,
      companyName:       colMap.companyName >= 0 ? (cellStr(ws, r, colMap.companyName)  || undefined) : undefined,
      phase:             parsePhase(colMap.phase >= 0 ? cellStr(ws, r, colMap.phase) : ''),
      businessUnit:      cellStr(ws, r, colMap.bu),
      division:          cellStr(ws, r, colMap.div),
      department:        cellStr(ws, r, colMap.dept),
      group:             cellStr(ws, r, colMap.group),
      team:              cellStr(ws, r, colMap.team),
      organizationLevel: cellNum(ws, r, colMap.level),
    })
  }
  return entries
}

// 発令区分セルの値 → 'before' | 'after' | 'both'
function parsePhase(v: string): 'before' | 'after' | 'both' {
  const s = v.trim()
  if (/^(前|旧|before|B)$/i.test(s)) return 'before'
  if (/^(後|新|after|A)$/i.test(s))  return 'after'
  return 'both'
}

// 元ワークブックをモジュール変数に保持（エクスポート時に要員配置リストシートだけ置換するため）
let _lastWorkbook: XLSX.WorkBook | null = null
let _lastFileName: string | null = null
export function getLastWorkbook(): XLSX.WorkBook | null { return _lastWorkbook }
export function getLastFileName(): string | null { return _lastFileName }

// OrgMasterEntry → Organization[] + Company[]
// ・会社コード / 会社名列がある場合は複数社に対応
// ・phase フィールドで発令前後に分割し、それぞれ別の階層ツリーを構築する
function orgMasterToEntities(
  entries:             OrgMasterEntry[],
  fallbackCompanyName = 'インポートデータ',
): {
  beforeOrganizations: Organization[]
  afterOrganizations:  Organization[]
  companies:           Company[]
} {
  // ── 1. 会社一覧を収集 ─────────────────────────────────────────
  // companyCode > companyName > fallback の優先度で会社IDを決定
  const companyMap = new Map<string, string>()   // companyId → companyName
  for (const e of entries) {
    const cid  = e.companyCode || e.companyName || fallbackCompanyName
    const cname = e.companyName || e.companyCode || fallbackCompanyName
    if (!companyMap.has(cid)) companyMap.set(cid, cname)
  }
  const companies: Company[] = [...companyMap.entries()].map(([id, name]) => ({
    id, name, hasSF: true,
  }))

  // ── 2. エントリのサブセットから Organization[] を構築 ─────────
  function buildOrgList(subset: OrgMasterEntry[]): Organization[] {
    const codeSet          = new Set(subset.map(e => e.code))
    const hasParentCodeCol = subset.some(e => e.parentCode && codeSet.has(e.parentCode))

    function findParentId(entry: OrgMasterEntry): string | null {
      // ① 上位組織コード列が信頼できれば直接使う
      if (hasParentCodeCol) {
        return (entry.parentCode && codeSet.has(entry.parentCode))
          ? entry.parentCode
          : null
      }
      // ② fallback: BU/部門/… の名称一致で親を探す
      const parentLevel = entry.organizationLevel - 1
      if (parentLevel <= 0) return null
      return subset.find(e => {
        if (e.organizationLevel !== parentLevel)                    return false
        if (e.businessUnit !== entry.businessUnit)                  return false
        if (parentLevel >= 2 && e.division   !== entry.division)   return false
        if (parentLevel >= 3 && e.department !== entry.department) return false
        if (parentLevel >= 4 && e.group      !== entry.group)      return false
        return true
      })?.code ?? null
    }

    const orgs: Organization[] = subset.filter(e => e.code).map(e => {
      const cid  = e.companyCode || e.companyName || fallbackCompanyName
      const derivedName = e.team || e.group || e.department || e.division || e.businessUnit || e.code
      return {
        id:           e.code,
        name:         e.name || derivedName,
        companyId:    cid,
        parentId:     findParentId(e),
        level:        e.organizationLevel || 2,
        externalCode: e.code,
      }
    })

    // 会社ごとに「未設定」受け皿ノードを追加
    for (const cid of companyMap.keys()) {
      orgs.push({
        id: `unassigned_${cid}`, name: '未設定', companyId: cid,
        parentId: null, level: 99, externalCode: undefined,
      })
    }
    return orgs
  }

  // ── 3. phase で分割して別々の階層を構築 ───────────────────────
  const beforeEntries = entries.filter(e => e.phase !== 'after')
  const afterEntries  = entries.filter(e => e.phase !== 'before')

  return {
    beforeOrganizations: buildOrgList(beforeEntries),
    afterOrganizations:  buildOrgList(afterEntries),
    companies,
  }
}

// ── 要員配置リストパーサー ─────────────────────────────────────────────────────
// excelIO.parseXlsx は File を受け取るため、workbook から直接読むバージョンを実装
const headerToKey = new Map<string, keyof AllocationList>(
  ALLOCATION_LIST_FIELDS.flatMap(f => {
    const key = f.key as keyof AllocationList
    const header = f.header ?? f.key
    return [[header, key], [header.trim(), key]]
  })
)

// ヘッダ行をスコアベースで検出（最初の10行のうち最もフィールド名が一致する行）
function findHeaderRowIndex(raw: unknown[][]): number {
  const headerSet = new Set(ALLOCATION_LIST_FIELDS.map(f => (f.header ?? f.key).trim()))
  let bestIdx = -1, bestScore = 1
  const limit = Math.min(10, raw.length)
  for (let i = 0; i < limit; i++) {
    const row = raw[i]
    if (!Array.isArray(row)) continue
    const score = (row as unknown[]).filter(c => typeof c === 'string' && headerSet.has((c as string).trim())).length
    if (score > bestScore) { bestScore = score; bestIdx = i }
  }
  return bestIdx
}

function parseAllocationSheet(ws: XLSX.WorkSheet): AllocationList[] {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  const headerIdx = findHeaderRowIndex(raw)
  console.group('[parseAllocationSheet]')
  console.log('total rows in sheet:', raw.length)
  console.log('header row index:', headerIdx)

  if (headerIdx < 0) {
    console.warn('header row not found')
    console.groupEnd()
    return []
  }

  const headers = (raw[headerIdx] as unknown[]).map(c => typeof c === 'string' ? c.trim() : '')
  const mappedHeaders = headers.filter(h => headerToKey.has(h))
  const unmappedHeaders = headers.filter(h => h && !headerToKey.has(h))
  console.log('mapped headers:', mappedHeaders.length, mappedHeaders)
  console.log('unmapped headers (first 10):', unmappedHeaders.slice(0, 10))

  const rows: AllocationList[] = []

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const dataRow = raw[i] as unknown[]
    if (dataRow.every(c => c === '' || c == null)) continue

    const entry: Record<string, string> = {}
    headers.forEach((header, idx) => {
      const key = headerToKey.get(header)
      if (!key) return
      const val = dataRow[idx]
      if (val !== '' && val != null) entry[key] = String(val)
    })

    if (i === headerIdx + 1) {
      console.log('first data row (raw):', dataRow.slice(0, 20))
      console.log('first data row (parsed keys):', Object.keys(entry))
    }

    if (!entry.userId) continue
    rows.push(entry as AllocationList)
  }
  console.log('parsed rows:', rows.length)
  console.groupEnd()
  return rows
}

// ── 統合インポート結果 ────────────────────────────────────────────────────────
export interface ImportedWorkbookResult {
  codeLists:           AllCodeLists
  beforeOrganizations: Organization[]  // 発令前組織マスタ（phase='before'|'both'）
  afterOrganizations:  Organization[]  // 発令後組織マスタ（phase='after'|'both'）
  companies:           Company[]
  allocationList:      AllocationRow[] // rowId 付き AllocationRow（Single Source of Truth）
  sheetsFound:         string[]
  sheetsMissing:       string[]
  // 表示用
  orgEntries:          OrgMasterEntry[]
  allocationRowCount:  number
}

// ── メインエクスポート ────────────────────────────────────────────────────────

export function importWorkbook(wb: XLSX.WorkBook, fallbackCompanyName = 'インポートデータ'): ImportedWorkbookResult {
  const sheetsFound:   string[] = []
  const sheetsMissing: string[] = []

  // 1. コードリスト (各種TBL)
  let codeLists: AllCodeLists = EMPTY_CODE_LISTS
  if (wb.Sheets[SHEET_CODE_LISTS]) {
    sheetsFound.push(SHEET_CODE_LISTS)
    const result = parseCodeListsFromWorkbook(wb, SHEET_CODE_LISTS)
    codeLists = { ...EMPTY_CODE_LISTS, ...result.lists }
  } else {
    sheetsMissing.push(SHEET_CODE_LISTS)
  }

  // 2. 組織CD一覧 → 発令前/後に分けた Organization[] を生成
  let orgEntries:           OrgMasterEntry[] = []
  let beforeOrganizations:  Organization[]   = []
  let afterOrganizations:   Organization[]   = []
  let companies:            Company[]        = []
  if (wb.Sheets[SHEET_ORG_MASTER]) {
    sheetsFound.push(SHEET_ORG_MASTER)
    orgEntries = parseOrgMaster(wb.Sheets[SHEET_ORG_MASTER])
    const entities      = orgMasterToEntities(orgEntries, fallbackCompanyName)
    beforeOrganizations = entities.beforeOrganizations
    afterOrganizations  = entities.afterOrganizations
    companies           = entities.companies
    codeLists           = { ...codeLists, orgMasterEntries: orgEntries }
  } else {
    sheetsMissing.push(SHEET_ORG_MASTER)
  }

  // 3. 要員配置リスト → AllocationRow（rowId = 1始まりの連番）
  let allocationList: AllocationRow[] = []
  if (wb.Sheets[SHEET_ALLOCATION]) {
    sheetsFound.push(SHEET_ALLOCATION)
    const rawRows = parseAllocationSheet(wb.Sheets[SHEET_ALLOCATION])
    allocationList = rawRows.map((row, idx) => ({ ...row, rowId: idx + 1 }))
  } else {
    sheetsMissing.push(SHEET_ALLOCATION)
  }

  return {
    codeLists,
    beforeOrganizations,
    afterOrganizations,
    companies,
    allocationList,
    sheetsFound,
    sheetsMissing,
    orgEntries,
    allocationRowCount: allocationList.length,
  }
}

// File から workbook を読んで importWorkbook を呼ぶ
export async function importFromFile(file: File): Promise<ImportedWorkbookResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = e.target?.result
        if (!data) throw new Error('ファイルの読み込みに失敗しました')
        _lastWorkbook = XLSX.read(data, { type: 'array' })
        _lastFileName = file.name
        // ファイル名から会社名を推定（拡張子・"要員配置"以降を除去）
        const companyName = file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[_\-]?要員配置.*$/i, '')
          .trim() || 'インポートデータ'
        resolve(importWorkbook(_lastWorkbook, companyName))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'))
    reader.readAsArrayBuffer(file)
  })
}

// URL から workbook を読んで importWorkbook を呼ぶ (サンプルデータ用)
export async function importFromUrl(url: string): Promise<ImportedWorkbookResult> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`サンプルファイルが見つかりません (${res.status}): ${url}`)
  const buffer = await res.arrayBuffer()
  _lastWorkbook = XLSX.read(buffer, { type: 'array' })
  _lastFileName = 'sample.xlsx'
  return importWorkbook(_lastWorkbook)
}
