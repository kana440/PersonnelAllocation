import { delay } from './delay'
import type { PersonInfo } from '../../../application/aiTypes'

export interface OrgFound {
  orgName: string
  members: PersonInfo[]
}

export const checkOrgMembersScenario = {
  async promptMessage(): Promise<string> {
    await delay(600)
    return '確認したい組織名を入力してください。'
  },

  async searchMessage(
    inputName: string,
    found: OrgFound | null,
  ): Promise<{ text: string; found: OrgFound } | { text: string }> {
    await delay(1000)
    if (!found || found.members.length === 0) {
      return { text: `「${inputName}」に一致する組織またはメンバーが見つかりませんでした。別の名前で試してください。` }
    }
    return {
      text: `「${found.orgName}」のメンバーは ${found.members.length} 名です。`,
      found,
    }
  },
}
