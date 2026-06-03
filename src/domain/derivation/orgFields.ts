import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists }  from '../codeLists/aggregate'
import type { DerivedUpdates } from './types'

export function deriveOrgSubFields(
  departmentCode: string,
  codeLists: AllCodeLists,
): DerivedUpdates {
  const entry = codeLists.orgMasterEntries.find(e => e.code === departmentCode && e.phase === 'after')
            ?? codeLists.orgMasterEntries.find(e => e.code === departmentCode)
  if (!entry) return {}
  return {
    businessUnit: entry.pathBusinessUnit || undefined,
    division:     entry.pathDivision     || undefined,
    subDivision:  entry.pathDepartment   || undefined,
    group:        entry.pathGroup        || undefined,
    team:         entry.pathTeam         || undefined,
    location:     entry.workLocation     || undefined,
    costCenter:   entry.costCenter       || undefined,
  }
}

export function reDeriveOrgSubFieldsForList(
  allocationList: AllocationRow[],
  codeLists: AllCodeLists,
): AllocationRow[] {
  return allocationList.map(r => {
    if (!r.departmentCode) return r
    const derived = deriveOrgSubFields(r.departmentCode as string, codeLists)
    const unchanged =
      r.businessUnit === derived.businessUnit &&
      r.division     === derived.division     &&
      r.subDivision  === derived.subDivision  &&
      r.group        === derived.group        &&
      r.team         === derived.team         &&
      r.location     === derived.location     &&
      r.costCenter   === derived.costCenter
    if (unchanged) return r
    return { ...r, ...derived }
  })
}

/** 出向者用組織かどうか（orgCategory に "出向者用組織" が含まれる） */
export function isSecondmentOrg(departmentCode: string, codeLists: AllCodeLists): boolean {
  const entry = codeLists.orgMasterEntries.find(e => e.code === departmentCode)
  return entry?.orgCategory?.includes('出向者用組織') ?? false
}

/**
 * prevDepartmentCode から出向先候補の出向者用組織コードを提案する。
 * 根に向かって辿り、最初に見つかった出向者用組織コードリストを返す。
 * 計算コスト削減のため orgMasterEntries を1回ループで parentCode マップを構築してから探索する。
 */
export function suggestSecondmentOrgCodes(
  prevDepartmentCode: string,
  codeLists: AllCodeLists,
): string[] {
  const entries = codeLists.orgMasterEntries.filter(e => e.phase === 'after' || !e.phase)

  // code → parentCode マップ（1パス構築）
  const parentMap = new Map<string, string>()
  const secondmentCodes = new Set<string>()
  const childrenMap = new Map<string, string[]>()

  for (const e of entries) {
    if (e.parentCode) {
      parentMap.set(e.code, e.parentCode)
      const siblings = childrenMap.get(e.parentCode) ?? []
      siblings.push(e.code)
      childrenMap.set(e.parentCode, siblings)
    }
    if (e.orgCategory?.includes('出向者用組織')) {
      secondmentCodes.add(e.code)
    }
  }

  // 根に向かって辿り、各ノードの兄弟に出向者用組織があればそれを返す
  let current: string | undefined = prevDepartmentCode
  while (current) {
    const parent = parentMap.get(current)
    if (!parent) break
    const siblings = childrenMap.get(parent) ?? []
    const candidates = siblings.filter(c => secondmentCodes.has(c) && c !== prevDepartmentCode)
    if (candidates.length > 0) return candidates
    current = parent
  }

  return []
}
