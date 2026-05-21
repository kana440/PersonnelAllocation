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


// ── 組織CD一覧パーサー ─────────────────────────────────────────────────────────
function parseOrgMaster(ws: XLSX.WorkSheet): OrgMasterEntry[] {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  const entries: OrgMasterEntry[] = []

  // 列インデックス（デフォルト: 固定レイアウト想定）
  let cCode = colIdx('B'), cParent = -1, cName = -1
  let cCompany = -1, cPhase = -1, cOrgLevel = -1
  let cBu = colIdx('C'), cDiv = colIdx('D'), cDept = colIdx('E')
  let cGroup = colIdx('F'), cTeam = colIdx('G')
  let cCostCenter = -1, cWorkLocation = -1
  let dataStartRow = 1

  // 先頭5行を走査し、'組織コード' 列が見つかった行をヘッダー行とする
  for (let r = 0; r <= Math.min(4, range.e.r); r++) {
    let foundCode = false
    for (let c = 0; c <= Math.min(range.e.c, 30); c++) {
      const h = String(ws[XLSX.utils.encode_cell({ r, c })]?.v ?? '').replace(/\s/g, '')
      if (!h) continue
      if      (/^組織コード$|^コード$/.test(h))               { cCode = c; foundCode = true }
      else if (/上位組織コード|親組織コード/.test(h))          { cParent = c }
      else if (/組織名|名称/.test(h))                          { cName = c }
      else if (/会社名|^会社$/i.test(h))                       { cCompany = c }
      else if (/発令区分|前後フラグ|フェーズ/i.test(h))        { cPhase = c }
      else if (/ビジネスユニット|^BU$/i.test(h))               { cBu = c }
      else if (/^部門$/.test(h))                               { cDiv = c }
      else if (/統括部/.test(h))                               { cDept = c }
      else if (/グループ/.test(h))                             { cGroup = c }
      else if (/チーム/.test(h))                               { cTeam = c }
      else if (/組織レベル|レベル/.test(h))                    { cOrgLevel = c }
      else if (/コストセンター|CostCenter/i.test(h))           { cCostCenter = c }
      else if (/勤務地|勤務場所|workLocation/i.test(h))        { cWorkLocation = c }
    }
    if (foundCode) { dataStartRow = r + 1; break }
  }

  for (let r = dataStartRow; r <= range.e.r; r++) {
    const code = cellStr(ws, r, cCode)
    if (!code) continue
    entries.push({
      code,
      parentCode:        cParent   >= 0 ? (cellStr(ws, r, cParent)   || undefined) : undefined,
      name:              cName     >= 0 ? (cellStr(ws, r, cName)      || undefined) : undefined,
      company:           cCompany  >= 0 ? cellStr(ws, r, cCompany) : '',
      phase:             parsePhase(cPhase >= 0 ? cellStr(ws, r, cPhase) : ''),
      businessUnit:      cellStr(ws, r, cBu),
      division:          cellStr(ws, r, cDiv),
      department:        cellStr(ws, r, cDept),
      group:             cellStr(ws, r, cGroup),
      team:              cellStr(ws, r, cTeam),
      organizationLevel: cOrgLevel    >= 0 ? cellStr(ws, r, cOrgLevel)    : '',
      CostCenter:        cCostCenter  >= 0 ? cellStr(ws, r, cCostCenter)  : '',
      workLocation:      cWorkLocation >= 0 ? cellStr(ws, r, cWorkLocation) : '',
    })
  }
  return entries
}

// 発令区分セルの値 → 'before' | 'after'（空セル・列なし → 'after'）
function parsePhase(v: string): 'before' | 'after' {
  return /^(前|旧|before|B)$/i.test(v.trim()) ? 'before' : 'after'
}

// 元ワークブックをモジュール変数に保持（エクスポート時に要員配置リストシートだけ置換するため）
let _lastWorkbook: XLSX.WorkBook | null = null
let _lastFileName: string | null = null
export function getLastWorkbook(): XLSX.WorkBook | null { return _lastWorkbook }
export function getLastFileName(): string | null { return _lastFileName }

// OrgMasterEntry → Organization[] + Company[]
// ・company 列がある場合は複数社に対応
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
  const companyMap = new Map<string, string>()   // companyId → companyName
  for (const e of entries) {
    const cid = e.company || fallbackCompanyName
    if (!companyMap.has(cid)) companyMap.set(cid, cid)
  }
  const companies: Company[] = [...companyMap.keys()].map(id => ({
    id, name: id, hasSF: true,
  }))

  // ── 2. エントリのサブセットから Organization[] を構築 ─────────
  function buildOrgList(subset: OrgMasterEntry[]): Organization[] {
    const codeSet = new Set(subset.map(e => e.code))

    const orgs: Organization[] = subset.filter(e => e.code).map(e => {
      const cid         = e.company || fallbackCompanyName
      const derivedName = e.team || e.group || e.department || e.division || e.businessUnit || e.code
      const parentId    = (e.parentCode && codeSet.has(e.parentCode)) ? e.parentCode : null
      return {
        id:           e.code,
        name:         e.name || derivedName,
        companyId:    cid,
        parentId,
        level:        1,   // 後で親チェーンから再計算
        externalCode: e.code,
      }
    })

    // 親チェーンを辿って level を確定
    const byId = new Map(orgs.map(o => [o.id, o]))
    for (const org of orgs) {
      let lvl = 1, cur = org
      while (cur.parentId && byId.has(cur.parentId) && lvl < 10) {
        cur = byId.get(cur.parentId)!
        lvl++
      }
      ;(org as { level: number }).level = lvl
    }

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
  // phase列がない場合は全エントリが 'after' になるため、before にも同じリストを使う
  const beforeEntries = entries.filter(e => e.phase === 'before')
  const afterEntries  = entries.filter(e => e.phase === 'after')

  return {
    beforeOrganizations: buildOrgList(beforeEntries.length > 0 ? beforeEntries : afterEntries),
    afterOrganizations:  buildOrgList(afterEntries.length  > 0 ? afterEntries  : beforeEntries),
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

    if (!entry.no) continue
    rows.push(entry as AllocationList)
  }
  console.log('parsed rows:', rows.length)
  console.groupEnd()
  return rows
}

// ── 統合インポート結果 ────────────────────────────────────────────────────────
export interface ImportedWorkbookResult {
  codeLists:           AllCodeLists
  beforeOrganizations: Organization[]  // 発令前組織マスタ（phase='before'）
  afterOrganizations:  Organization[]  // 発令後組織マスタ（phase='after'）
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
