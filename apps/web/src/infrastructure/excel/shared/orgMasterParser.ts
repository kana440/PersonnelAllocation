// 組織CD一覧 / 旧組織CD一覧シートを unknown[][] から解析する純粋関数（ライブラリ非依存）

import type { OrgMasterEntry }   from '@personnel/domain/masters/orgMaster'
import { buildOrgHierarchy }     from '@personnel/domain/masters/orgHierarchy'
import type { Organization }     from '@personnel/domain/schemas'
import type { ColumnWarning }    from '../types'

// r, c は 0-indexed
function cellStr(raw: unknown[][], r: number, c: number): string {
  return String(raw[r]?.[c] ?? '').trim()
}


export interface ParseOrgMasterResult {
  entries:        OrgMasterEntry[]
  columnWarnings: ColumnWarning[]
}

/**
 * 組織マスタシートを解析する。
 * @param sheetName  警告メッセージに表示するシート名
 * @param defaultPhase  全エントリに付与する新旧フラグ
 *   'after'  = 組織CD一覧（新組織）
 *   'before' = 旧組織CD一覧（旧組織）
 */
export function parseOrgMasterRaw(
  raw:          unknown[][],
  sheetName:    string             = '組織CD一覧',
  defaultPhase: 'before' | 'after' = 'after',
): ParseOrgMasterResult {
  const columnWarnings: ColumnWarning[] = []
  const rowCount = raw.length
  const entries: OrgMasterEntry[] = []

  let cCode = 1, cParent = -1, cName = -1  // B列デフォルト (0-indexed: 1)
  let cCompany = -1, cCompanyCode = -1, cOrgLevel = -1
  let cBu = 2, cDiv = 3, cDept = 4   // C, D, E 列デフォルト
  let cGroup = 5, cTeam = 6           // F, G 列デフォルト
  let cCostCenter = -1, cWorkLocation = -1
  let dataStartRow = 1

  const colCount = raw[0]?.length ?? 0

  for (let r = 0; r <= Math.min(4, rowCount - 1); r++) {
    let foundCode = false
    for (let c = 0; c <= Math.min(colCount - 1, 30); c++) {
      const h = cellStr(raw, r, c).replace(/\s/g, '')
      if (!h) continue
      if      (/^組織コード$|^コード$/.test(h))               { cCode = c; foundCode = true }
      else if (/上位組織コード|親組織コード/.test(h))          { cParent = c }
      else if (/組織名|名称/.test(h))                          { cName = c }
      else if (/^会社コード$/i.test(h))                        { cCompanyCode = c }
      else if (/会社名|^会社$/i.test(h))                       { cCompany = c }
      else if (/ビジネスユニット|関係部門|^BU$/i.test(h))       { cBu = c }
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

  if (cName < 0) columnWarnings.push({ sheet: sheetName, message: '「組織名」列が見つかりません。組織コードを名称の代わりに使用します。' })

  for (let r = dataStartRow; r < rowCount; r++) {
    const code = cellStr(raw, r, cCode)
    if (!code) continue
    entries.push({
      code,
      companyCode:      cCompanyCode  >= 0 ? (cellStr(raw, r, cCompanyCode) || undefined) : undefined,
      parentCode:       cParent       >= 0 ? (cellStr(raw, r, cParent)       || undefined) : undefined,
      name:             cName         >= 0 ? (cellStr(raw, r, cName)          || undefined) : undefined,
      company:          cCompany      >= 0 ? cellStr(raw, r, cCompany) : '',
      phase:            defaultPhase,
      pathBusinessUnit: cellStr(raw, r, cBu),
      pathDivision:     cellStr(raw, r, cDiv),
      pathDepartment:   cellStr(raw, r, cDept),
      pathGroup:        cellStr(raw, r, cGroup),
      pathTeam:         cellStr(raw, r, cTeam),
      orgCategory:      cOrgLevel     >= 0 ? cellStr(raw, r, cOrgLevel)     : '',
      costCenter:       cCostCenter   >= 0 ? cellStr(raw, r, cCostCenter)   : '',
      workLocation:     cWorkLocation >= 0 ? cellStr(raw, r, cWorkLocation) : '',
    })
  }
  return { entries, columnWarnings }
}

export function orgMasterToEntities(
  newEntries:          OrgMasterEntry[],   // 組織CD一覧（新組織） → afterOrganizations
  oldEntries:          OrgMasterEntry[],   // 旧組織CD一覧（旧組織） → beforeOrganizations（空なら新組織でフォールバック）
  fallbackCompanyName = 'インポートデータ',
): { beforeOrganizations: Organization[]; afterOrganizations: Organization[] } {
  const companyIds = new Set<string>()
  for (const e of [...newEntries, ...oldEntries]) companyIds.add(e.company || fallbackCompanyName)

  function buildOrgList(subset: OrgMasterEntry[]): Organization[] {
    // buildOrgHierarchy が O(n) 2 パスで level / parentId を確定する
    const { hierarchy } = buildOrgHierarchy(subset)
    const orgCodeSet = new Set(subset.map(e => e.code).filter(Boolean))

    const orgs: Organization[] = []
    for (const e of subset) {
      if (!e.code) continue
      const h    = hierarchy.get(e.code)!
      const cid  = e.company || fallbackCompanyName
      const name = e.name
        ?? (e.pathTeam || e.pathGroup || e.pathDepartment || e.pathDivision || e.pathBusinessUnit || e.code)
      // Excel に上位組織コード列があればそちらを優先し、なければパスベースの計算を使う
      const parentId = (e.parentCode && orgCodeSet.has(e.parentCode))
        ? e.parentCode
        : h.parentId
      orgs.push({ id: e.code, name, companyId: cid, parentId, level: h.level, externalCode: e.code })
    }

    for (const cid of companyIds) {
      orgs.push({ id: `unassigned_${cid}`, name: '未設定', companyId: cid, parentId: null, level: 99, externalCode: undefined })
    }
    return orgs
  }

  return {
    afterOrganizations:  buildOrgList(newEntries),
    beforeOrganizations: buildOrgList(oldEntries.length > 0 ? oldEntries : newEntries),
  }
}
