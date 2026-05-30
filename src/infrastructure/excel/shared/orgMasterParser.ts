// 組織CD一覧シートを unknown[][] から解析する純粋関数（ライブラリ非依存）

import type { OrgMasterEntry } from '../../../domain/codeLists/orgMaster'
import type { Organization }   from '../../../domain/schemas'

// A=0, B=1 …
function colIdx(letter: string): number {
  let n = 0
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

// r, c は 0-indexed
function cellStr(raw: unknown[][], r: number, c: number): string {
  return String(raw[r]?.[c] ?? '').trim()
}

function parsePhase(v: string): 'before' | 'after' {
  return /^(前|旧|before|B)$/i.test(v.trim()) ? 'before' : 'after'
}

export function parseOrgMasterRaw(raw: unknown[][]): OrgMasterEntry[] {
  const rowCount = raw.length
  const entries: OrgMasterEntry[] = []

  let cCode = colIdx('B'), cParent = -1, cName = -1
  let cCompany = -1, cCompanyCode = -1, cPhase = -1, cOrgLevel = -1
  let cBu = colIdx('C'), cDiv = colIdx('D'), cDept = colIdx('E')
  let cGroup = colIdx('F'), cTeam = colIdx('G')
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

  for (let r = dataStartRow; r < rowCount; r++) {
    const code = cellStr(raw, r, cCode)
    if (!code) continue
    entries.push({
      code,
      companyCode:       cCompanyCode >= 0 ? (cellStr(raw, r, cCompanyCode) || undefined) : undefined,
      parentCode:        cParent      >= 0 ? (cellStr(raw, r, cParent)       || undefined) : undefined,
      name:              cName        >= 0 ? (cellStr(raw, r, cName)          || undefined) : undefined,
      company:           cCompany     >= 0 ? cellStr(raw, r, cCompany) : '',
      phase:             parsePhase(cPhase >= 0 ? cellStr(raw, r, cPhase) : ''),
      businessUnit:      cellStr(raw, r, cBu),
      division:          cellStr(raw, r, cDiv),
      department:        cellStr(raw, r, cDept),
      group:             cellStr(raw, r, cGroup),
      team:              cellStr(raw, r, cTeam),
      organizationLevel: cOrgLevel    >= 0 ? cellStr(raw, r, cOrgLevel)    : '',
      CostCenter:        cCostCenter  >= 0 ? cellStr(raw, r, cCostCenter)  : '',
      workLocation:      cWorkLocation >= 0 ? cellStr(raw, r, cWorkLocation) : '',
    })
  }
  return entries
}

export function orgMasterToEntities(
  entries:             OrgMasterEntry[],
  fallbackCompanyName = 'インポートデータ',
): { beforeOrganizations: Organization[]; afterOrganizations: Organization[] } {
  const companyIds = new Set<string>()
  for (const e of entries) companyIds.add(e.company || fallbackCompanyName)

  function buildOrgList(subset: OrgMasterEntry[]): Organization[] {
    const codeSet = new Set(subset.map(e => e.code))
    const orgs: Organization[] = subset.filter(e => e.code).map(e => {
      const cid         = e.company || fallbackCompanyName
      const derivedName = e.team || e.group || e.department || e.division || e.businessUnit || e.code
      const parentId    = (e.parentCode && codeSet.has(e.parentCode)) ? e.parentCode : null
      return { id: e.code, name: e.name || derivedName, companyId: cid, parentId, level: 1, externalCode: e.code }
    })

    const byId = new Map(orgs.map(o => [o.id, o]))
    for (const org of orgs) {
      let lvl = 1, cur = org
      while (cur.parentId && byId.has(cur.parentId) && lvl < 10) { cur = byId.get(cur.parentId)!; lvl++ }
      ;(org as { level: number }).level = lvl
    }

    for (const cid of companyIds) {
      orgs.push({ id: `unassigned_${cid}`, name: '未設定', companyId: cid, parentId: null, level: 99, externalCode: undefined })
    }
    return orgs
  }

  const beforeEntries = entries.filter(e => e.phase === 'before')
  const afterEntries  = entries.filter(e => e.phase === 'after')
  return {
    beforeOrganizations: buildOrgList(beforeEntries.length > 0 ? beforeEntries : afterEntries),
    afterOrganizations:  buildOrgList(afterEntries.length  > 0 ? afterEntries  : beforeEntries),
  }
}
