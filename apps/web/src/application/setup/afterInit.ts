import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization }   from '@personnel/domain/schemas'
import type { AllMasters }     from '@personnel/domain/masters/aggregate'
import { FIELD_METADATA }      from '@personnel/domain/allocationRow'
import { buildOrgMap }         from '@personnel/domain/choices/rows'
import { normalizeSearch }     from '../../utils/normalizeSearch'

// ── 判定 ──────────────────────────────────────────────────────────────────────

export function isUninitializedRow(row: AllocationRow, masters: AllMasters): boolean {
  if (!row.userId) return false
  if (row.transferReason) return false
  const reasonEntry = masters.transferReasons.find(r => r.label === row.transferReason)
  if (reasonEntry?.noCheckRequired) return false
  return FIELD_METADATA.every(({ after }) => !row[after as keyof AllocationRow])
}

// ── 組織マッチング ─────────────────────────────────────────────────────────────

export type MatchConfidence = 'code' | 'name' | 'none'

export interface OrgMappingGroup {
  prevCode:        string | null
  prevOrgName:     string | null
  /** 旧組織の上位階層パス（ルート〜直接親、最大2段）。例: "... > 事業部B > 部C" */
  prevOrgPath:     string | null
  newOrgCode:      string | null
  autoMatched:     boolean
  matchConfidence: MatchConfidence
  /**
   * 未マッチ組織のUI絞り込み用スコープ（新組織ツリーのノードID）。
   * マッチ済み兄弟の新組織を seeds として LCA を計算した結果。
   * null = スコープ推論できず（全件表示）。
   */
  scopeOrgId:      string | null
  rowIds:          number[]
}

// ── LCA ───────────────────────────────────────────────────────────────────────

/** 祖先チェーン（self → parent → ... → root） */
function ancestorChain(org: Organization, byId: Map<string, Organization>): Organization[] {
  const chain: Organization[] = []
  let cur: Organization | undefined = org
  while (cur) {
    chain.push(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return chain
}

/**
 * seeds の最近共通祖先（LCA）を返す。
 * seeds が 1 件のときは「その親」（兄弟を探せるスコープ）を返す。
 */
function lca(seeds: Organization[], byId: Map<string, Organization>): Organization | null {
  if (seeds.length === 0) return null
  if (seeds.length === 1) {
    return seeds[0].parentId ? (byId.get(seeds[0].parentId) ?? null) : null
  }

  // 2件目以降の祖先セット
  const restSets = seeds.slice(1).map(seed => {
    const set = new Set<string>()
    let cur: Organization | undefined = seed
    while (cur) { set.add(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined }
    return set
  })

  // 1件目の祖先チェーンを上に辿り、全 restSets に含まれる最初のものが LCA
  for (const org of ancestorChain(seeds[0], byId)) {
    if (restSets.every(s => s.has(org.id))) return org
  }
  return null
}

// ── グループ化 ────────────────────────────────────────────────────────────────

export function buildOrgMappingGroups(
  allocationList: AllocationRow[],
  afterOrganizations: Organization[],
  beforeOrganizations: Organization[],
  masters: AllMasters,
): OrgMappingGroup[] {
  const uninit          = allocationList.filter(r => isUninitializedRow(r, masters))
  const afterOrgByCode  = buildOrgMap(afterOrganizations)
  const beforeOrgByCode = buildOrgMap(beforeOrganizations)
  const afterById       = new Map(afterOrganizations.map(o => [o.id, o]))
  const beforeById      = new Map(beforeOrganizations.map(o => [o.id, o]))

  // 新組織: 正規化名 → 候補リスト（廃止除く）
  const afterByName = new Map<string, Organization[]>()
  for (const o of afterOrganizations.filter(o => !o.isAbandoned)) {
    const key = normalizeSearch(o.name)
    const list = afterByName.get(key) ?? []
    list.push(o)
    afterByName.set(key, list)
  }

  // prevDepartmentCode でグループ化（割り当て行）
  const groupMap = new Map<string | null, number[]>()
  for (const r of uninit) {
    const key = r.prevDepartmentCode ?? null
    const existing = groupMap.get(key)
    if (existing) existing.push(r.rowId)
    else groupMap.set(key, [r.rowId])
  }

  // ── Pass 1 / Pass 2: 各 prevCode のマッチング ────────────────────────────
  type MatchResult = { newOrg: Organization; confidence: Exclude<MatchConfidence, 'none'> }
  const matchResults = new Map<string, MatchResult>()

  for (const [prevCode] of groupMap) {
    if (!prevCode) continue

    // Pass 1: externalCode 完全一致
    const byCode = afterOrgByCode.get(prevCode)
    if (byCode) {
      matchResults.set(prevCode, { newOrg: byCode, confidence: 'code' })
      continue
    }

    // Pass 2: 正規化名が一致 かつ候補が 1 件のみ
    const beforeOrg = beforeOrgByCode.get(prevCode)
    if (beforeOrg) {
      const candidates = afterByName.get(normalizeSearch(beforeOrg.name)) ?? []
      if (candidates.length === 1) {
        matchResults.set(prevCode, { newOrg: candidates[0], confidence: 'name' })
      }
    }
  }

  // ── LCA スコープ推論 ───────────────────────────────────────────────────────
  // 旧親 ID → その配下でマッチ済みの新組織リスト
  const parentToSeeds = new Map<string, Organization[]>()
  for (const [prevCode, result] of matchResults) {
    const beforeOrg = beforeOrgByCode.get(prevCode)
    if (!beforeOrg?.parentId) continue
    const list = parentToSeeds.get(beforeOrg.parentId) ?? []
    list.push(result.newOrg)
    parentToSeeds.set(beforeOrg.parentId, list)
  }

  // 旧親 ID → LCA の新組織 ID
  const parentToScopeId = new Map<string, string>()
  for (const [parentId, seeds] of parentToSeeds) {
    const scope = lca(seeds, afterById)
    if (scope) parentToScopeId.set(parentId, scope.id)
  }

  // ── グループ生成 ──────────────────────────────────────────────────────────
  const groups: OrgMappingGroup[] = []

  for (const [prevCode, rowIds] of groupMap) {
    const beforeOrg   = prevCode ? beforeOrgByCode.get(prevCode) : null
    const prevOrgName = beforeOrg?.name ?? prevCode

    // 旧組織の上位階層パス（ルート〜直接親）を構築
    let prevOrgPath: string | null = null
    if (beforeOrg) {
      const ancestors: string[] = []
      let cur = beforeOrg.parentId ? beforeById.get(beforeOrg.parentId) : null
      while (cur) {
        ancestors.unshift(cur.name)
        cur = cur.parentId ? beforeById.get(cur.parentId) : null
      }
      if (ancestors.length > 0) {
        prevOrgPath = ancestors.join(' > ')
      }
    }

    const match      = prevCode ? matchResults.get(prevCode) : null
    const confidence = match?.confidence ?? 'none'
    const newOrgCode = match ? (match.newOrg.externalCode ?? match.newOrg.id) : null

    // スコープ: マッチ済みは自組織の親、未マッチは旧親グループの LCA
    let scopeOrgId: string | null = null
    if (match?.newOrg.parentId) {
      scopeOrgId = match.newOrg.parentId
    } else if (beforeOrg?.parentId) {
      scopeOrgId = parentToScopeId.get(beforeOrg.parentId) ?? null
    }

    groups.push({
      prevCode,
      prevOrgName,
      prevOrgPath,
      newOrgCode,
      autoMatched:     confidence !== 'none',
      matchConfidence: confidence,
      scopeOrgId,
      rowIds,
    })
  }

  // ソート: 上位階層から下位へ（深さ昇順）→ 同深さは親パス順（セクションまとめ）→ 組織名順
  // 新入社員（prevCode=null）は末尾
  groups.sort((a, b) => {
    if (a.prevCode === null && b.prevCode !== null) return 1
    if (a.prevCode !== null && b.prevCode === null) return -1
    if (a.prevCode === null && b.prevCode === null) return 0

    // 親パスの要素数 = 深さ（null = 0）
    const depthA = a.prevOrgPath ? a.prevOrgPath.split(' > ').length : 0
    const depthB = b.prevOrgPath ? b.prevOrgPath.split(' > ').length : 0
    if (depthA !== depthB) return depthA - depthB

    // 同深さ: 親パス（セクション）でまとめる
    const pathA = a.prevOrgPath ?? ''
    const pathB = b.prevOrgPath ?? ''
    if (pathA !== pathB) return pathA.localeCompare(pathB, 'ja')

    // 同セクション: 旧組織名順
    return (a.prevOrgName ?? '').localeCompare(b.prevOrgName ?? '', 'ja')
  })

  return groups
}

// ── 適用 ──────────────────────────────────────────────────────────────────────

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
