import type { Organization } from '@personnel/domain/schemas'
import type { OrgMasterEntry } from '@personnel/domain/masters/orgMaster'
import type { PanelDef } from '../../../store/canvasLayoutStore'
import { PATH_FIELDS, ENTRY_FIELD, cardIsEmpty, type FilterCard, type GlobalFilters, type PathField } from './types'

// ── サブツリー計算 ─────────────────────────────────────────────────────────

/** org ごとに自身と全子孫の org ID セットを返す */
export function buildSubtreeMap(orgs: Organization[]): Map<string, Set<string>> {
  const childrenOf = new Map<string, string[]>()
  for (const o of orgs) {
    if (o.parentId) {
      const arr = childrenOf.get(o.parentId) ?? []
      arr.push(o.id)
      childrenOf.set(o.parentId, arr)
    }
  }

  const subtreeOf = new Map<string, Set<string>>()

  function getSubtree(id: string): Set<string> {
    if (subtreeOf.has(id)) return subtreeOf.get(id)!
    const s = new Set<string>([id])
    for (const cid of childrenOf.get(id) ?? []) {
      for (const d of getSubtree(cid)) s.add(d)
    }
    subtreeOf.set(id, s)
    return s
  }

  for (const o of orgs) getSubtree(o.id)
  return subtreeOf
}

/**
 * 複数の org ID の最近傍共通祖先 (LCA) を返す。
 * orgById は id → Organization のマップ。
 */
export function computeLca(
  orgIds: string[],
  orgById: Map<string, Organization>,
): string | null {
  if (orgIds.length === 0) return null
  if (orgIds.length === 1) return orgIds[0]

  // ルートから辿る先祖チェーン（root-first）
  function ancestors(id: string): string[] {
    const chain: string[] = []
    let o = orgById.get(id)
    while (o) {
      chain.push(o.id)
      o = o.parentId ? orgById.get(o.parentId) : undefined
    }
    return chain.reverse()
  }

  const chains = orgIds.map(ancestors)
  const minLen = Math.min(...chains.map(c => c.length))
  let lca: string | null = null

  for (let i = 0; i < minLen; i++) {
    const node = chains[0][i]
    if (chains.every(c => c[i] === node)) lca = node
    else break
  }

  return lca
}

// ── フィルタマッチング ─────────────────────────────────────────────────────

function orgMatchesCard(
  orgId:       string,
  card:        FilterCard,
  entryByCode: Map<string, OrgMasterEntry>,
  codeById:    Map<string, string>,
  subtreeMap:  Map<string, Set<string>>,
): boolean {
  // サブツリーフィルタ（設定されている場合、いずれかの配下でなければ除外）
  if (card.subtreeOrgIds.length > 0) {
    const inSubtree = card.subtreeOrgIds.some(rootId => subtreeMap.get(rootId)?.has(orgId))
    if (!inSubtree) return false
  }

  // パスフィールドフィルタ（同一カード内 AND）
  for (const field of PATH_FIELDS) {
    const selected = card[field]
    if (selected.length === 0) continue
    const code = codeById.get(orgId)
    if (!code) return false
    const entry = entryByCode.get(code)
    if (!entry) return false
    const val = entry[ENTRY_FIELD[field]] as string
    if (!selected.includes(val)) return false
  }

  return true
}

/**
 * フィルタを適用して表示すべきパネルを返す。
 * - カード間: OR
 * - グローバル hasMembers: AND（memberOrgIds が空のときは適用しない）
 * - secondmentOrgIds: 強制表示（hasMembers・カードを無視）
 */
export function applyCanvasFilters(params: {
  panels:           PanelDef[]
  filterCards:      FilterCard[]
  globalFilters:    GlobalFilters
  allOrgs:          Organization[]
  orgMasterEntries: OrgMasterEntry[]
  memberOrgIds:     Set<string>
  secondmentOrgIds: Set<string>
  subtreeMap:       Map<string, Set<string>>
}): PanelDef[] {
  const {
    panels, filterCards, globalFilters, allOrgs, orgMasterEntries,
    memberOrgIds, secondmentOrgIds, subtreeMap,
  } = params

  const entryByCode = new Map(
    orgMasterEntries.filter(e => e.phase === 'after').map(e => [e.code, e]),
  )
  const codeById    = new Map(allOrgs.map(o => [o.id, o.externalCode ?? '']))
  const activeCards = filterCards.filter(c => !cardIsEmpty(c))

  // memberOrgIds が空（データ未ロード）のときは hasMembers を適用しない
  const applyHasMembers = globalFilters.hasMembers && memberOrgIds.size > 0

  // subtreeOrgIds のルート org は hasMembers によらず常に表示
  // （LCA 等のルートをコンテナとして強制表示し、子パネルが接続線付きで表示されるようにする）
  const forceShowOrgIds = new Set<string>([
    ...secondmentOrgIds,
    ...activeCards.flatMap(c => c.subtreeOrgIds),
  ])

  const matchesCards = (orgId: string): boolean => {
    if (activeCards.length === 0) return true
    return activeCards.some(card =>
      orgMatchesCard(orgId, card, entryByCode, codeById, subtreeMap),
    )
  }

  return panels.filter(({ orgId }) => {
    if (forceShowOrgIds.has(orgId)) return true                   // LCA ルート・出向ペア: 強制表示
    if (applyHasMembers && !memberOrgIds.has(orgId)) return false // 人あり: AND
    return matchesCards(orgId)                                    // カード: OR
  })
}

/**
 * 指定フィールドで選べる値の一覧を返す。
 * 上位フィールドに選択がある場合はそれでフィルタする（カスケード）。
 */
export function getAvailableValues(
  field: PathField,
  card: FilterCard,
  orgMasterEntries: OrgMasterEntry[],
): string[] {
  const parentFields = PATH_FIELDS.slice(0, PATH_FIELDS.indexOf(field)) as PathField[]

  const relevant = orgMasterEntries.filter(e => {
    if (e.phase !== 'after') return false
    for (const pf of parentFields) {
      const selected = card[pf]
      if (selected.length === 0) continue
      if (!selected.includes(e[ENTRY_FIELD[pf]] as string)) return false
    }
    return true
  })

  const key = ENTRY_FIELD[field]
  return [...new Set(relevant.map(e => e[key] as string).filter(Boolean))].sort()
}
