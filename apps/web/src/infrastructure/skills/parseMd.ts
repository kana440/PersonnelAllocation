import type { Skill, SkillStatus } from './types'

const VALID_STATUS = new Set<SkillStatus>(['active', 'disabled', 'draft'])

function isStatus(v: string): v is SkillStatus {
  return VALID_STATUS.has(v as SkillStatus)
}

interface ParsedFrontmatter {
  fields:       Record<string, string>
  metadata:     Record<string, string>  // metadata: ブロック内のキー
  allowedTools: string[]
}

/**
 * Agent Skills 標準のフロントマターをパースする。
 *
 * 対応形式:
 *   - 新形式（Agent Skills 標準）: name = kebab-case識別子、metadata.display-name = 表示名
 *   - 旧形式（後方互換）: slug = 識別子、name = 表示名
 *
 * metadata: ブロックは 2-space インデントの key: value 行として処理する。
 */
function parseFrontmatter(fmText: string): ParsedFrontmatter {
  const fields:   Record<string, string> = {}
  const metadata: Record<string, string> = {}
  let inMetadata = false

  for (const line of fmText.split('\n')) {
    // metadata: ブロック内のインデント行
    if (inMetadata) {
      if (line.startsWith('  ') || line.startsWith('\t')) {
        const idx = line.indexOf(':')
        if (idx > 0) {
          metadata[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
        }
        continue
      }
      inMetadata = false
    }

    const idx = line.indexOf(':')
    if (idx <= 0) continue

    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()

    if (key === 'metadata') {
      inMetadata = true
    } else {
      fields[key] = val
    }
  }

  // allowed-tools は空白区切りのツール名列
  const allowedTools = fields['allowed-tools']
    ? fields['allowed-tools'].split(/\s+/).filter(Boolean)
    : []

  return { fields, metadata, allowedTools }
}

/**
 * Agent Skills 標準の YAML frontmatter 付き markdown を Skill オブジェクトに変換する。
 *
 * 新形式:  name（kebab-case） + metadata.display-name（表示名） + metadata.status
 * 旧形式:  slug + name（表示名） + status  ← 後方互換として引き続き読み込める
 */
export function parseSkillMd(raw: string, defaults?: Partial<Skill>): Skill | null {
  const fmMatch = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw)
  if (!fmMatch) return null

  const { fields, metadata, allowedTools } = parseFrontmatter(fmMatch[1] ?? '')

  // slug の解決: 新形式は name フィールドが kebab-case 識別子、旧形式は slug フィールド
  const nameField = fields['name'] ?? ''
  const isNewFormat = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nameField) && !fields['slug']

  const slug        = isNewFormat ? nameField : (fields['slug'] ?? defaults?.slug ?? nameField)
  const displayName = isNewFormat
    ? (metadata['display-name'] ?? nameField)
    : (nameField || (defaults?.name ?? slug))

  if (!slug) return null

  const rawStatus = metadata['status'] ?? fields['status']
  const status: SkillStatus = (rawStatus && isStatus(rawStatus))
    ? rawStatus
    : (defaults?.status ?? 'active')

  // risk フィールド
  const rawRisk = fields['risk']
  const risk = (rawRisk === 'low' || rawRisk === 'medium' || rawRisk === 'high')
    ? rawRisk
    : defaults?.risk

  // requires-confirmation フィールド
  const rawConfirm = fields['requires-confirmation']
  const requiresConfirmation = rawConfirm !== undefined
    ? rawConfirm === 'true'
    : defaults?.requiresConfirmation

  return {
    slug,
    name:                 displayName,
    description:          fields['description'] ?? defaults?.description ?? '',
    instructions:         (fmMatch[2] ?? '').trim(),
    allowedTools:         allowedTools.length ? allowedTools : (defaults?.allowedTools ?? []),
    risk,
    requiresConfirmation,
    status,
    isBuiltin:            defaults?.isBuiltin ?? false,
    updatedAt:            defaults?.updatedAt ?? new Date().toISOString(),
  }
}

/** Skill オブジェクトを Agent Skills 標準の SKILL.md 形式に変換する */
export function toSkillMd(skill: Skill): string {
  const metaLines = [`  display-name: ${skill.name}`]
  if (skill.status !== 'active') metaLines.push(`  status: ${skill.status}`)

  const allowedToolsLine = skill.allowedTools?.length
    ? `allowed-tools: ${skill.allowedTools.join(' ')}\n`
    : ''

  const riskLine                = skill.risk ? `risk: ${skill.risk}\n` : ''
  const requiresConfirmationLine = skill.requiresConfirmation !== undefined
    ? `requires-confirmation: ${skill.requiresConfirmation}\n`
    : ''

  return [
    '---',
    `name: ${skill.slug}`,
    `description: ${skill.description}`,
    riskLine + requiresConfirmationLine + allowedToolsLine + 'metadata:',
    ...metaLines,
    '---',
    '',
    skill.instructions,
    '',
  ].join('\n')
}
