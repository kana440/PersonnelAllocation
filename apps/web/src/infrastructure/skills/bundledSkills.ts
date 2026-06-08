import type { Skill } from './types'
import { parseSkillMd } from './parseMd'

// Vite の import.meta.glob で ai/skills/*/SKILL.md を全件取得（Agent Skills 標準ディレクトリ構造）
const SKILL_MODULES = import.meta.glob<string>(
  '../ai/skills/*/SKILL.md',
  { query: '?raw', import: 'default' }
)

let _cache: Skill[] | null = null

export async function loadBundledSkills(): Promise<Skill[]> {
  if (_cache) return _cache

  const results: Skill[] = []
  for (const [path, loader] of Object.entries(SKILL_MODULES)) {
    try {
      const raw  = await loader()
      // パス例: ../ai/skills/cascading-transfer/SKILL.md → slug = cascading-transfer
      const slug = path.replace(/^.*\/skills\//, '').replace(/\/SKILL\.md$/, '')
      const skill = parseSkillMd(raw, { slug, isBuiltin: true, updatedAt: '' })
      if (skill) results.push({ ...skill, isBuiltin: true })
    } catch {
      // 不正形式のファイルはスキップ
    }
  }
  _cache = results
  return results
}

export async function getBundledSkill(slug: string): Promise<Skill | null> {
  const all = await loadBundledSkills()
  return all.find(s => s.slug === slug) ?? null
}

export function clearBundledCache(): void {
  _cache = null
}
