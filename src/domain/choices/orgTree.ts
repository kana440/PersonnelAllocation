import type { Organization } from '../schemas'

// 指定した組織以下の全 ID セットを返す（inclusive）
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

// 組織ツリーを DFS 順にフラット化して depth 付きで返す（ドロップダウン表示用）
export function flattenOrgTree(
  allOrgs: Organization[],
): Array<{ org: Organization; depth: number }> {
  const byParent = new Map<string | null, Organization[]>()
  for (const org of allOrgs) {
    const key = org.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(org)
  }

  const result: Array<{ org: Organization; depth: number }> = []
  function visit(parentId: string | null, depth: number) {
    for (const org of byParent.get(parentId) ?? []) {
      result.push({ org, depth })
      visit(org.id, depth + 1)
    }
  }
  visit(null, 0)
  return result
}
