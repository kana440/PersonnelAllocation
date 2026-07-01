import type { Organization } from '../schemas'
import type { AllocationRow } from '../allocationRow'
import { getDescendantOrgIds } from '../rules/options/orgTree'

export type MatchConfidence = 'exact' | 'name' | 'overlap' | 'none'

export interface OrgMatch {
  beforeOrg:    Organization
  afterOrg:     Organization | null
  confidence:   MatchConfidence
  overlapRatio: number
}

// 名称類似度: 0〜1 (1=完全一致, 0.8=部分一致, 0=不一致)
// 部署名に多い接尾辞を除去して比較する
function nameSimilarity(a: string, b: string): number {
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[部課室チームグループ担当]/g, '')
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.8
  return 0
}

// beforeOrg の子孫に属するメンバーが after でどの org に多く移っているかを計算し
// 最も重複が多い afterOrg を返す。
// 優先順位: (1) externalCode 完全一致 → (2) 名称類似 → (3) メンバー重複率
export function buildOrgMatchIndex(
  allocationList: AllocationRow[],
  beforeOrgs:     Organization[],
  afterOrgs:      Organization[],
): Map<string, OrgMatch> {
  const result = new Map<string, OrgMatch>()

  const afterByCode = new Map<string, Organization>()
  for (const o of afterOrgs) {
    if (o.externalCode) afterByCode.set(o.externalCode, o)
  }

  for (const bOrg of beforeOrgs) {
    // Step 1: externalCode 完全一致
    if (bOrg.externalCode) {
      const exact = afterByCode.get(bOrg.externalCode)
      if (exact) {
        result.set(bOrg.id, { beforeOrg: bOrg, afterOrg: exact, confidence: 'exact', overlapRatio: 1 })
        continue
      }
    }

    // Step 2: 名称類似
    let bestNameOrg: Organization | null = null
    let bestNameScore = 0
    for (const aOrg of afterOrgs) {
      const score = nameSimilarity(bOrg.name, aOrg.name)
      if (score > bestNameScore) { bestNameScore = score; bestNameOrg = aOrg }
    }
    if (bestNameOrg && bestNameScore >= 0.8) {
      result.set(bOrg.id, { beforeOrg: bOrg, afterOrg: bestNameOrg, confidence: 'name', overlapRatio: bestNameScore })
      continue
    }

    // Step 3: メンバー重複率
    const descendantIds = getDescendantOrgIds(bOrg.id, beforeOrgs)
    const descendantCodes = new Set(
      beforeOrgs.filter(o => descendantIds.has(o.id) && o.externalCode).map(o => o.externalCode!)
    )
    const beforeMembers = new Set<string>()
    for (const row of allocationList) {
      if (row.prevDepartmentCode && descendantCodes.has(row.prevDepartmentCode) && row.userId) {
        beforeMembers.add(row.userId)
      }
    }

    if (beforeMembers.size === 0) {
      result.set(bOrg.id, { beforeOrg: bOrg, afterOrg: bestNameOrg, confidence: bestNameOrg ? 'name' : 'none', overlapRatio: bestNameScore })
      continue
    }

    // ルートレベルの afterOrg との重複を計算（計算コスト削減）
    const afterRoots = afterOrgs.filter(o => !o.parentId)
    let bestOrg: Organization | null = null
    let bestRatio = 0

    for (const aRoot of afterRoots) {
      const aDescIds   = getDescendantOrgIds(aRoot.id, afterOrgs)
      const aDescCodes = new Set(
        afterOrgs.filter(o => aDescIds.has(o.id) && o.externalCode).map(o => o.externalCode!)
      )
      let overlap = 0
      for (const row of allocationList) {
        if (row.userId && beforeMembers.has(row.userId) &&
            row.departmentCode && aDescCodes.has(row.departmentCode)) {
          overlap++
        }
      }
      const ratio = overlap / beforeMembers.size
      if (ratio > bestRatio) { bestRatio = ratio; bestOrg = aRoot }
    }

    if (bestOrg && bestRatio > 0) {
      result.set(bOrg.id, { beforeOrg: bOrg, afterOrg: bestOrg, confidence: 'overlap', overlapRatio: bestRatio })
    } else {
      result.set(bOrg.id, { beforeOrg: bOrg, afterOrg: null, confidence: 'none', overlapRatio: 0 })
    }
  }

  return result
}

/**
 * buildOrgMatchIndex の結果を OrgMapping 形式（beforeOrgId → afterOrgId[]）に変換する。
 * afterOrg が null（廃止）の場合は空配列を設定する。
 */
export function orgMatchIndexToMapping(
  index: Map<string, OrgMatch>,
): Map<string, string[]> {
  const mapping = new Map<string, string[]>()
  for (const [beforeOrgId, match] of index) {
    mapping.set(beforeOrgId, match.afterOrg ? [match.afterOrg.id] : [])
  }
  return mapping
}

export function findBestAfterOrg(
  bOrgId:         string,
  allocationList: AllocationRow[],
  beforeOrgs:     Organization[],
  afterOrgs:      Organization[],
): OrgMatch | null {
  const bOrg = beforeOrgs.find(o => o.id === bOrgId)
  if (!bOrg) return null
  const index = buildOrgMatchIndex(allocationList, beforeOrgs, afterOrgs)
  return index.get(bOrgId) ?? { beforeOrg: bOrg, afterOrg: null, confidence: 'none', overlapRatio: 0 }
}
