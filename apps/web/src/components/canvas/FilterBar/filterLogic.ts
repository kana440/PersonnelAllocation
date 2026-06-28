import type { Organization }   from '@personnel/domain/schemas'
import type { OrgMasterEntry } from '@personnel/domain/masters/orgMaster'
import type { PanelDef }       from '../../../store/canvasLayoutStore'
import { cardIsEmpty, TEXT_OPS, type FilterCard, type FilterField, type FilterOperator, type GlobalFilters } from './types'

// ── サブツリー計算 ─────────────────────────────────────────────────────────

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

export function computeLca(
  orgIds: string[],
  orgById: Map<string, Organization>,
): string | null {
  if (orgIds.length === 0) return null
  if (orgIds.length === 1) return orgIds[0]

  function ancestors(id: string): string[] {
    const chain: string[] = []
    let o = orgById.get(id)
    while (o) { chain.push(o.id); o = o.parentId ? orgById.get(o.parentId) : undefined }
    return chain.reverse()
  }

  const chains = orgIds.map(ancestors)
  const minLen  = Math.min(...chains.map(c => c.length))
  let lca: string | null = null
  for (let i = 0; i < minLen; i++) {
    const node = chains[0][i]
    if (chains.every(c => c[i] === node)) lca = node
    else break
  }
  return lca
}

// ── フィールド値取得 ────────────────────────────────────────────────────────

const ORG_MASTER_FIELD: Record<Exclude<FilterField, 'orgName'>, keyof OrgMasterEntry> = {
  businessUnit: 'pathBusinessUnit',
  division:     'pathDivision',
  department:   'pathDepartment',
  group:        'pathGroup',
  team:         'pathTeam',
}

function getFieldValue(
  orgId:       string,
  field:       FilterField,
  orgByIdMap:  Map<string, Organization>,
  entryByCode: Map<string, OrgMasterEntry>,
  codeById:    Map<string, string>,
): string {
  const org = orgByIdMap.get(orgId)
  if (!org) return ''
  if (field === 'orgName') return org.name ?? ''
  const code  = codeById.get(orgId) ?? ''
  const entry = code ? entryByCode.get(code) : undefined
  return entry ? (entry[ORG_MASTER_FIELD[field]] as string ?? '') : ''
}

function evalOp(fieldVal: string, op: FilterOperator, values: string[]): boolean {
  if (values.length === 0) return true
  const lower = fieldVal.toLowerCase()
  if (op === 'contains')     return values.some(v => lower.includes(v.toLowerCase()))
  if (op === 'not-contains') return values.every(v => !lower.includes(v.toLowerCase()))
  if (op === 'in')           return values.some(v => v.toLowerCase() === lower)
  if (op === 'not-in')       return values.every(v => v.toLowerCase() !== lower)
  return true
}

// ── フィルタマッチング ─────────────────────────────────────────────────────

/** rule.subtree === true のルールについて、事前に「配下として含まれる orgId の全集合」を計算する */
function buildSubtreeDescendants(
  activeCards:  FilterCard[],
  orgByIdMap:   Map<string, Organization>,
  subtreeMap:   Map<string, Set<string>>,
): Map<string /* ruleId */, Set<string> /* descendant orgIds */> {
  const result = new Map<string, Set<string>>()
  for (const card of activeCards) {
    for (const rule of card.rules) {
      if (!rule.subtree || rule.values.length === 0) continue
      const vals = TEXT_OPS.has(rule.operator) ? rule.values.slice(0, 1) : rule.values
      const descendants = new Set<string>()
      for (const [id, org] of orgByIdMap) {
        if (!org.name) continue
        if (evalOp(org.name, rule.operator, vals)) {
          // この組織の配下全員を descendants に追加
          for (const d of subtreeMap.get(id) ?? []) descendants.add(d)
        }
      }
      result.set(rule.id, descendants)
    }
  }
  return result
}

function orgMatchesCard(
  orgId:               string,
  card:                FilterCard,
  orgByIdMap:          Map<string, Organization>,
  entryByCode:         Map<string, OrgMasterEntry>,
  codeById:            Map<string, string>,
  subtreeDescendants:  Map<string, Set<string>>,
): boolean {
  for (const rule of card.rules) {
    if (rule.values.length === 0 && !rule.subtree) continue
    const vals = TEXT_OPS.has(rule.operator) ? rule.values.slice(0, 1) : rule.values
    const fieldVal      = getFieldValue(orgId, rule.field, orgByIdMap, entryByCode, codeById)
    const matchesDirect = vals.length > 0 ? evalOp(fieldVal, rule.operator, vals) : false
    const matchesSubtree = rule.subtree ? (subtreeDescendants.get(rule.id)?.has(orgId) ?? false) : false

    if (!matchesDirect && !matchesSubtree) return false
  }
  return true
}

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

  const entryByCode  = new Map(orgMasterEntries.filter(e => e.phase === 'after').map(e => [e.code, e]))
  const codeById     = new Map(allOrgs.map(o => [o.id, o.externalCode ?? '']))
  const orgByIdMap   = new Map(allOrgs.map(o => [o.id, o]))
  const activeCards  = filterCards.filter(c => !cardIsEmpty(c))

  // subtree: true のルールについて配下 orgId を事前計算
  const subtreeDescendants = buildSubtreeDescendants(activeCards, orgByIdMap, subtreeMap)

  // 全 subtree ルールの配下 orgId を union したセット（hasMembers スキップ用）
  const allSubtreeIds = new Set<string>()
  for (const desc of subtreeDescendants.values()) {
    for (const id of desc) allSubtreeIds.add(id)
  }

  const matchesCards = (orgId: string): boolean => {
    if (activeCards.length === 0) return true
    return activeCards.some(card =>
      orgMatchesCard(orgId, card, orgByIdMap, entryByCode, codeById, subtreeDescendants),
    )
  }

  return panels.filter(({ orgId }) => {
    if (secondmentOrgIds.has(orgId)) return true
    if (!matchesCards(orgId)) return false
    // subtree ルールの配下に入っている orgId は hasMembers を適用しない
    if (globalFilters.hasMembers && !memberOrgIds.has(orgId) && !allSubtreeIds.has(orgId)) return false
    return true
  })
}

// ── フィールド選択肢 ────────────────────────────────────────────────────────

export function getFieldOptions(
  field:            FilterField,
  orgMasterEntries: OrgMasterEntry[],
  allOrgs:          Organization[],
): string[] {
  if (field === 'orgName') {
    return [...new Set(allOrgs.map(o => o.name ?? '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'))
  }
  const key   = ORG_MASTER_FIELD[field]
  const after = orgMasterEntries.filter(e => e.phase === 'after')
  return [...new Set(after.map(e => e[key] as string).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'))
}
