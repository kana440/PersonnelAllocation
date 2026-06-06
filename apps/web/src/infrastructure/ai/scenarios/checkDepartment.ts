import { delay } from './delay'
import type { OrgTreeNode, PersonInfo } from '../../../application/aiTypes'
import type { Organization } from '@personnel/domain/schemas'
import type { PersonSearchResult } from '../../../application/aiTools'

export function buildOrgTree(
  org: Organization,
  allOrgs: Organization[],
  persons: PersonSearchResult[],
): OrgTreeNode {
  const orgCode = org.externalCode ?? org.id
  const members: PersonInfo[] = persons
    .filter(p => p.orgCode === orgCode)
    .map(p => ({ userId: p.userId, name: p.name, orgName: org.name, rowIds: p.rowIds }))
  const children = allOrgs
    .filter(o => o.parentId === org.id)
    .map(c => buildOrgTree(c, allOrgs, persons))
  return { orgId: org.id, orgName: org.name, orgCode, members, children }
}

export function countTreeMembers(node: OrgTreeNode): number {
  return node.members.length + node.children.reduce((s, c) => s + countTreeMembers(c), 0)
}

export const checkDepartmentScenario = {
  async promptMessage(): Promise<string> {
    await delay(600)
    return '確認したい部門名を入力してください。部門名の一部でも検索できます。'
  },

  async searchMessage(
    inputName: string,
    org: Organization | null,
    tree: OrgTreeNode | null,
  ): Promise<{ text: string; orgName: string; tree: OrgTreeNode } | { text: string }> {
    await delay(1200)
    if (!org || !tree) {
      return { text: `「${inputName}」に一致する部門が見つかりませんでした。別の名前で試してください。` }
    }
    const count = countTreeMembers(tree)
    return {
      text: `「${org.name}」（配下含む計 ${count} 名）の組織ツリーです。▸ をクリックして配下組織を展開できます。`,
      orgName: org.name,
      tree,
    }
  },
}
