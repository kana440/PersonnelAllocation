// 組織マスタエントリの階層構造をパス列から導出するユーティリティ
// buildOrgList（orgMasterParser）と validateMasters の両方で共有する。

import type { OrgMasterEntry } from './orgMaster'

const SEP = '\x00'

// 会社名 + 5 つのパス値を連結してマップキーを作る（array alloc を避けるため直接連結）
export function orgPathKey(
  company: string,
  bu:   string,
  div:  string,
  dept: string,
  grp:  string,
  team: string,
): string {
  return company + SEP + bu + SEP + div + SEP + dept + SEP + grp + SEP + team
}

export interface OrgHierarchyInfo {
  level:    number        // BU=1, 部門=2, 統括部=3, グループ=4, チーム=5
  parentId: string | null // パス列から導出した親コード（ルートは null）
}

/**
 * エントリ群からパスキー → コードのマップと、各コードの階層情報を O(n) で構築する。
 *
 * 計算量:
 *   パス 1: pathToCode Map 構築 — O(n)
 *   パス 2: level / parentId 導出 — O(n)（Map.get は O(1)）
 *   全体  — O(n × k)  k = パス文字列平均長（定数扱い）
 *
 * 呼び出し側は buildOrgHierarchy を 1 回呼べばよく、
 * pk() の呼び出し回数はエントリあたり最大 2 回（自身キー + 親キー）に抑えられる。
 */
export function buildOrgHierarchy(entries: OrgMasterEntry[]): {
  pathToCode: Map<string, string>
  hierarchy:  Map<string, OrgHierarchyInfo>
} {
  // パス 1: 各エントリのフルパスキー → コード
  const pathToCode = new Map<string, string>()
  for (const e of entries) {
    if (!e.code) continue
    const key = orgPathKey(e.company, e.pathBusinessUnit, e.pathDivision, e.pathDepartment, e.pathGroup, e.pathTeam)
    if (!pathToCode.has(key)) pathToCode.set(key, e.code)
  }

  // パス 2: level と parentId を確定
  const hierarchy = new Map<string, OrgHierarchyInfo>()
  for (const e of entries) {
    if (!e.code) continue
    let level:     number
    let parentKey: string | null = null
    const c = e.company

    if      (e.pathTeam)       { level = 5; parentKey = orgPathKey(c, e.pathBusinessUnit, e.pathDivision, e.pathDepartment, e.pathGroup, '') }
    else if (e.pathGroup)      { level = 4; parentKey = orgPathKey(c, e.pathBusinessUnit, e.pathDivision, e.pathDepartment, '', '') }
    else if (e.pathDepartment) { level = 3; parentKey = orgPathKey(c, e.pathBusinessUnit, e.pathDivision, '', '', '') }
    else if (e.pathDivision)   { level = 2; parentKey = orgPathKey(c, e.pathBusinessUnit, '', '', '', '') }
    else                       { level = 1 }

    hierarchy.set(e.code, {
      level,
      parentId: parentKey != null ? (pathToCode.get(parentKey) ?? null) : null,
    })
  }

  return { pathToCode, hierarchy }
}
