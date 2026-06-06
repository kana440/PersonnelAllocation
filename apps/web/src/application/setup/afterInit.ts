import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization }   from '@personnel/domain/schemas'
import type { AllCodeLists }   from '@personnel/domain/masters/aggregate'
import { FIELD_METADATA }      from '@personnel/domain/allocationRow'
import { buildOrgMap }         from '@personnel/domain/choices/rows'

// ── 判定 ──────────────────────────────────────────────────────────────────────

/**
 * 「after 初期化が必要な行」の判定。
 * 条件: userId あり かつ transferReason も FIELD_METADATA の全 after フィールドも全て空。
 * noCheckRequired な異動事由（退職・削除系）が入っている行は false になる。
 */
export function isUninitializedRow(row: AllocationRow, codeLists: AllCodeLists): boolean {
  if (!row.userId) return false
  if (row.transferReason) return false
  const reasonEntry = codeLists.transferReasons.find(r => r.label === row.transferReason)
  if (reasonEntry?.noCheckRequired) return false
  return FIELD_METADATA.every(({ after }) => !row[after as keyof AllocationRow])
}

// ── グループ化 ────────────────────────────────────────────────────────────────

export interface OrgMappingGroup {
  prevCode:    string | null
  prevOrgName: string | null
  newOrgCode:  string | null  // null = 未選択（後で設定）
  autoMatched: boolean        // afterOrgs に同一コードが存在し自動選択
  rowIds:      number[]
}

/**
 * 未初期化行を prevDepartmentCode でグループ化し、
 * afterOrgs への自動マッピングを試みたグループ一覧を返す。
 */
export function buildOrgMappingGroups(
  allocationList: AllocationRow[],
  afterOrganizations: Organization[],
  beforeOrganizations: Organization[],
  codeLists: AllCodeLists,
): OrgMappingGroup[] {
  const uninit = allocationList.filter(r => isUninitializedRow(r, codeLists))
  const afterOrgByCode  = buildOrgMap(afterOrganizations)
  const beforeOrgByCode = buildOrgMap(beforeOrganizations)

  const groupMap = new Map<string | null, number[]>()
  for (const r of uninit) {
    const key = r.prevDepartmentCode ?? null
    const existing = groupMap.get(key)
    if (existing) existing.push(r.rowId)
    else groupMap.set(key, [r.rowId])
  }

  const groups: OrgMappingGroup[] = []
  for (const [prevCode, rowIds] of groupMap) {
    const afterOrg  = prevCode ? afterOrgByCode.get(prevCode) : null
    const beforeOrg = prevCode ? beforeOrgByCode.get(prevCode) : null
    const prevOrgName = beforeOrg?.name ?? prevCode

    // 新組織コードの自動判定: externalCode を優先、なければ id
    const newOrgCode = afterOrg
      ? (afterOrg.externalCode ?? afterOrg.id)
      : null

    groups.push({ prevCode, prevOrgName, newOrgCode, autoMatched: !!afterOrg, rowIds })
  }

  // 自動マッチ済み → 上、未マッチ → 中、旧コードなし（新入社員）→ 末尾
  groups.sort((a, b) => {
    if (a.prevCode === null && b.prevCode !== null) return 1
    if (a.prevCode !== null && b.prevCode === null) return -1
    if (a.autoMatched && !b.autoMatched) return -1
    if (!a.autoMatched && b.autoMatched) return 1
    return (a.prevOrgName ?? '').localeCompare(b.prevOrgName ?? '', 'ja')
  })

  return groups
}

// ── 適用 ──────────────────────────────────────────────────────────────────────

/**
 * 未初期化行に prev* フィールドをコピーして初期化した新 allocationList を返す。
 * departmentCode のみ groups の org 選択で上書き（null の場合は prev をコピー）。
 * transferReason は意図的にコピーしない（空白 = 変更なしのシグナル）。
 */
export function applyAfterInit(
  allocationList: AllocationRow[],
  groups: OrgMappingGroup[],
): AllocationRow[] {
  const orgCodeByRowId = new Map<number, string | null>()
  for (const g of groups) {
    for (const rowId of g.rowIds) {
      orgCodeByRowId.set(rowId, g.newOrgCode)
    }
  }

  return allocationList.map(row => {
    if (!orgCodeByRowId.has(row.rowId)) return row

    const newOrgCode = orgCodeByRowId.get(row.rowId) ?? null
    const updated: Record<string, unknown> = { ...row }

    for (const { after, before } of FIELD_METADATA) {
      if (after === 'departmentCode') {
        updated.departmentCode = newOrgCode ?? (row[before as keyof AllocationRow] as string | undefined)
      } else {
        updated[after] = row[before as keyof AllocationRow]
      }
    }

    return updated as AllocationRow
  })
}
