export type SkillStatus = 'active' | 'disabled' | 'draft'

export interface Skill {
  slug:                  string        // kebab-case 一意識別子
  name:                  string        // 表示名
  description:           string        // いつ使うか（systemPrompt メタデータ用・短く）
  instructions:          string        // スキル手順 markdown 全文
  allowedTools?:         string[]      // allowed-tools フィールド（Agent Skills 標準）
  /** リスクレベル。Structured Path のスキル選択・表示に使う。 */
  risk?:                 'low' | 'medium' | 'high'
  /** true のとき確認ウィジェットが必ず発生する（UI表示用メタデータ）。 */
  requiresConfirmation?: boolean
  status:                SkillStatus
  isBuiltin:             boolean       // true = コードバンドルの .md 由来
  updatedAt:             string        // ISO 8601
}

export interface ISkillRepository {
  list():                       Promise<Skill[]>
  save(skill: Skill):           Promise<void>
  delete(slug: string):         Promise<void>
  resetToBuiltin(slug: string): Promise<void>
}
