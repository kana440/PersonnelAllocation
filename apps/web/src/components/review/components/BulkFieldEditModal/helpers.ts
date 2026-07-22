import { ALLOCATION_LIST_FIELDS } from '@personnel/domain/csvImport/allocationList/labels'
import type { Organization } from '@personnel/domain/schemas'

// ── フィールド設定 ──────────────────────────────────────────────────────────

/** 一括適用ではなく行ごとのインライン編集を使うフィールド */
export const INLINE_EDIT_FIELDS = new Set([
  'userId', 'groupEmployeeId', 'employeeNumber', 'assignee',
])

/** jobFamily+jobType を1つのペアエラーとして扱う際の合成フィールドキー */
export const JOB_PAIR_FIELD = '__jobPair__'

export type ModalMode = 'bulk' | 'pair' | 'inline'

export function getModalMode(field: string): ModalMode {
  if (field === JOB_PAIR_FIELD)      return 'pair'
  if (INLINE_EDIT_FIELDS.has(field)) return 'inline'
  return 'bulk'
}

// ── 表示列設定（Excel 列順・全フィールド） ────────────────────────────────

export type ColumnSection = 'after' | 'before'

export interface ColumnDef {
  field:     string
  label:     string
  section:   ColumnSection
  /** true = 常に表示・チェックボックス無効（変更不可） */
  readOnly?: boolean
}

/** 列ピッカーから除外するフィールド（氏名は "氏名" カラムとして常時表示） */
const EXCLUDED_KEYS = new Set(['no', 'lastName', 'firstName'])

/** デフォルト表示固定（チェック済み・変更不可） */
const READONLY_KEYS = new Set(['employeeNumber', 'employmentType'])

/** Excel 全列を Excelの列順で並べた選択可能カラム定義 */
export const OPTIONAL_COLUMNS: ColumnDef[] = ALLOCATION_LIST_FIELDS
  .filter(f => !EXCLUDED_KEYS.has(f.key))
  .map(f => ({
    field:    f.key,
    label:    f.header ?? f.key,
    section:  f.key.startsWith('prev') ? 'before' as const : 'after' as const,
    readOnly: READONLY_KEYS.has(f.key),
  }))

/** readOnly フィールドは常に表示（初期値として使用） */
export const READONLY_FIELDS: ReadonlySet<string> = new Set(
  OPTIONAL_COLUMNS.filter(c => c.readOnly).map(c => c.field),
)

// ── 組織パス構築 ────────────────────────────────────────────────────────────

/**
 * externalCode → 全祖先を含む表示パス（例: "事業部A › 営業部 › 第一グループ"）
 * 組織フィルタはこのパス文字列に対して部分一致検索する。
 */
export function buildOrgPathMap(orgs: Organization[]): Map<string, string> {
  const byId   = new Map(orgs.map(o => [o.id, o]))
  const result = new Map<string, string>()
  for (const org of orgs) {
    if (!org.externalCode) continue
    const parts: string[] = []
    let cur: Organization | undefined = org
    while (cur) {
      parts.unshift(cur.name)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    result.set(org.externalCode, parts.join(' › '))
  }
  return result
}
