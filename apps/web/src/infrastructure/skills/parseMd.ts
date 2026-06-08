import type { Skill, SkillStatus } from './types'

const VALID_STATUS = new Set<SkillStatus>(['active', 'disabled', 'draft'])

function isStatus(v: string): v is SkillStatus {
  return VALID_STATUS.has(v as SkillStatus)
}

/**
 * YAML frontmatter 付き markdown テキストを Skill オブジェクトに変換する。
 * frontmatter の各行は "key: value" 形式（単純パーサ）。
 */
export function parseSkillMd(raw: string, defaults?: Partial<Skill>): Skill | null {
  const fmMatch = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw)
  if (!fmMatch) return null

  const meta: Record<string, string> = {}
  for (const line of (fmMatch[1] ?? '').split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
  }

  const slug = meta['slug'] ?? defaults?.slug ?? ''
  if (!slug) return null

  const status = meta['status']
  return {
    slug,
    name:         meta['name']        ?? defaults?.name        ?? slug,
    description:  meta['description'] ?? defaults?.description ?? '',
    instructions: (fmMatch[2] ?? '').trim(),
    status:       (status && isStatus(status)) ? status : (defaults?.status ?? 'active'),
    isBuiltin:    defaults?.isBuiltin ?? false,
    updatedAt:    defaults?.updatedAt ?? new Date().toISOString(),
  }
}

/** Skill オブジェクトを frontmatter 付き markdown に変換する */
export function toSkillMd(skill: Skill): string {
  const lines = [
    '---',
    `slug: ${skill.slug}`,
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    `status: ${skill.status}`,
    '---',
    '',
    skill.instructions,
    '',
  ]
  return lines.join('\n')
}
