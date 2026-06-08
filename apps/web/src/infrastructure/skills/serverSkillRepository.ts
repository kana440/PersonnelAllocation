import type { ISkillRepository, Skill } from './types'
import { loadBundledSkills, getBundledSkill } from './bundledSkills'
import type { ApiSkill } from '../api/adminApi'
import { adminApi } from '../api/adminApi'

function apiToSkill(s: ApiSkill, isBuiltin: boolean): Skill {
  return {
    slug:         s.slug,
    name:         s.name,
    description:  s.description,
    instructions: s.instructions,
    status:       s.status,
    isBuiltin,
    updatedAt:    s.updatedAt,
  }
}

export class ServerSkillRepository implements ISkillRepository {
  async list(): Promise<Skill[]> {
    const bundled = await loadBundledSkills()
    const bundledMap = new Map(bundled.map(b => [b.slug, b]))

    let serverSkills: ApiSkill[] = []
    try {
      serverSkills = await adminApi.skills.list()
    } catch {
      // サーバー未起動時は組み込みスキルにフォールバック
      return bundled
    }

    const serverMap = new Map(serverSkills.map(s => [s.slug, s]))
    const result: Skill[] = []

    // 組み込みスキルをサーバー上書きと合成
    for (const b of bundled) {
      const override = serverMap.get(b.slug)
      result.push(override ? apiToSkill(override, true) : b)
    }

    // サーバー側でユーザーが追加したスキル（組み込みにない slug）
    for (const s of serverSkills) {
      if (!bundledMap.has(s.slug)) {
        result.push(apiToSkill(s, false))
      }
    }

    return result
  }

  async save(skill: Skill): Promise<void> {
    await adminApi.skills.upsert(skill.slug, {
      name:         skill.name,
      description:  skill.description,
      instructions: skill.instructions,
      status:       skill.status,
      isBuiltin:    skill.isBuiltin,
    })
  }

  async delete(slug: string): Promise<void> {
    const builtin = await getBundledSkill(slug)
    if (builtin) {
      // 組み込みは削除できない → status=disabled でサーバーに保存
      await adminApi.skills.upsert(slug, { status: 'disabled' })
    } else {
      await adminApi.skills.delete(slug)
    }
  }

  async resetToBuiltin(slug: string): Promise<void> {
    // サーバー上のオーバーライドを削除 → 組み込みにフォールバック
    try { await adminApi.skills.delete(slug) } catch { /* already gone */ }
  }
}
