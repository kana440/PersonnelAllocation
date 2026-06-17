import type { Organization } from '../schemas'

// 組織ツリーを展開した 1 エントリ。AI ツール・UI ドロップダウン両方で使う。
export interface FlatOrgEntry {
  orgId:            string   // org.id（内部UUID）
  orgCode:          string   // externalCode ?? id
  orgName:          string
  companyId:        string
  level:            number   // org.level（1=会社, 2=BU, …）
  depth:            number   // ツリー深さ（0=ルート）
  parentOrgCode?:   string
  path:             string[] // ルートから自身まで（inclusive）の orgName 列
  ancestorCodes:    string[] // ルートから親まで（self 除く）の orgCode 列
  descendantCodes:  string[] // 配下の全 orgCode（self 除く）
}

// 組織一覧から展開済みビューを構築する（純粋関数）
export function buildFlatOrgView(allOrgs: Organization[]): FlatOrgEntry[] {
  const getCode = (o: Organization): string => o.externalCode ?? o.id

  const byParent = new Map<string | null, Organization[]>()
  for (const org of allOrgs) {
    const key = org.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(org)
  }

  const entries = new Map<string, FlatOrgEntry>()

  function visit(parentId: string | null, depth: number, path: string[], ancestorCodes: string[]) {
    for (const org of byParent.get(parentId) ?? []) {
      const code       = getCode(org)
      const parentCode = ancestorCodes.length > 0 ? ancestorCodes[ancestorCodes.length - 1] : undefined
      entries.set(code, {
        orgId:           org.id,
        orgCode:         code,
        orgName:         org.name,
        companyId:       org.companyId,
        level:           org.level,
        depth,
        parentOrgCode:   parentCode,
        path:            [...path, org.name],
        ancestorCodes:   [...ancestorCodes],
        descendantCodes: [],
      })
      visit(org.id, depth + 1, [...path, org.name], [...ancestorCodes, code])
    }
  }

  visit(null, 0, [], [])

  // 各エントリの orgCode を祖先エントリの descendantCodes に追加
  for (const [code, entry] of entries) {
    for (const ancestorCode of entry.ancestorCodes) {
      entries.get(ancestorCode)?.descendantCodes.push(code)
    }
  }

  return [...entries.values()]
}

// 指定した組織以下の全 ID セットを返す（inclusive）— 後方互換シム
export function getDescendantOrgIds(rootOrgId: string, allOrgs: Organization[]): Set<string> {
  const result = new Set<string>([rootOrgId])
  const queue  = [rootOrgId]
  while (queue.length > 0) {
    const parentId = queue.shift()!
    for (const org of allOrgs) {
      if (org.parentId === parentId && !result.has(org.id)) {
        result.add(org.id)
        queue.push(org.id)
      }
    }
  }
  return result
}

// 組織ツリーを DFS 順にフラット化して depth 付きで返す（ドロップダウン表示用）— 後方互換シム
export function flattenOrgTree(
  allOrgs: Organization[],
): Array<{ org: Organization; depth: number }> {
  return buildFlatOrgView(allOrgs).map(e => ({
    org: allOrgs.find(o => o.id === e.orgId)!,
    depth: e.depth,
  }))
}
