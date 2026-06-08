import type { ISkillRepository, Skill, SkillStatus } from './types'
import { loadBundledSkills, getBundledSkill } from './bundledSkills'

const LS_KEY = 'skill_store_v1'

interface StoredEntry {
  slug:          string
  name?:         string
  description?:  string
  instructions?: string
  status?:       SkillStatus
  updatedAt:     string
  deleted?:      boolean  // ユーザー作成スキルの削除マーカー（組み込みは削除不可）
}

function readStore(): Map<string, StoredEntry> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return new Map()
    const arr = JSON.parse(raw) as StoredEntry[]
    return new Map(arr.map(s => [s.slug, s]))
  } catch {
    return new Map()
  }
}

function writeStore(map: Map<string, StoredEntry>): void {
  localStorage.setItem(LS_KEY, JSON.stringify([...map.values()]))
}

export class LocalSkillRepository implements ISkillRepository {
  async list(): Promise<Skill[]> {
    const builtin = await loadBundledSkills()
    const stored  = readStore()
    const result: Skill[] = []

    // 組み込みスキル + localStorage のオーバーライドをマージ
    for (const b of builtin) {
      const override = stored.get(b.slug)
      if (override?.deleted) continue
      result.push({
        slug:         b.slug,
        name:         override?.name         ?? b.name,
        description:  override?.description  ?? b.description,
        instructions: override?.instructions ?? b.instructions,
        allowedTools: b.allowedTools,           // allowed-tools はバンドル定義を常に使う
        status:       override?.status       ?? b.status,
        isBuiltin:    true,
        updatedAt:    override?.updatedAt    ?? b.updatedAt,
      })
    }

    // ユーザーが新規作成したスキル（組み込みにない slug）
    const builtinSlugs = new Set(builtin.map(b => b.slug))
    for (const [slug, entry] of stored) {
      if (builtinSlugs.has(slug) || entry.deleted) continue
      result.push({
        slug,
        name:         entry.name         ?? slug,
        description:  entry.description  ?? '',
        instructions: entry.instructions ?? '',
        status:       entry.status       ?? 'draft',
        isBuiltin:    false,
        updatedAt:    entry.updatedAt,
      })
    }

    return result
  }

  async save(skill: Skill): Promise<void> {
    const stored  = readStore()
    const builtin = await getBundledSkill(skill.slug)
    const now     = new Date().toISOString()

    if (builtin) {
      // 組み込みとの差分のみ保存
      const diff: StoredEntry = { slug: skill.slug, updatedAt: now }
      if (skill.name         !== builtin.name)         diff.name         = skill.name
      if (skill.description  !== builtin.description)  diff.description  = skill.description
      if (skill.instructions !== builtin.instructions) diff.instructions = skill.instructions
      if (skill.status       !== builtin.status)       diff.status       = skill.status
      stored.set(skill.slug, diff)
    } else {
      stored.set(skill.slug, {
        slug:         skill.slug,
        name:         skill.name,
        description:  skill.description,
        instructions: skill.instructions,
        status:       skill.status,
        updatedAt:    now,
      })
    }

    writeStore(stored)
  }

  async delete(slug: string): Promise<void> {
    const stored  = readStore()
    const builtin = await getBundledSkill(slug)

    if (builtin) {
      // 組み込みは削除できない → 「非表示」として deleted フラグを立てる
      stored.set(slug, { slug, deleted: true, updatedAt: new Date().toISOString() })
    } else {
      stored.delete(slug)
    }

    writeStore(stored)
  }

  async resetToBuiltin(slug: string): Promise<void> {
    const stored = readStore()
    stored.delete(slug)
    writeStore(stored)
  }
}
