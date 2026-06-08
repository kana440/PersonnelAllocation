import type { Skill } from '../skills/types'

/**
 * アクティブなスキル一覧から AgentRunner の systemPrompt 付加文字列を生成する。
 * useSkillStore().activeSkills を渡す。スキルなしの場合は空文字列を返す。
 */
export function buildSkillSystemPrompt(activeSkills: Skill[]): string {
  if (activeSkills.length === 0) return ''

  const sections = activeSkills.map(s =>
    `## スキル: ${s.name}\n${s.description}\n\n${s.instructions}`
  )

  return [
    '# 利用可能なスキル',
    '',
    '以下のスキルが有効です。関連するタスクでは手順に従って操作を行ってください。',
    '',
    sections.join('\n\n---\n\n'),
  ].join('\n')
}
