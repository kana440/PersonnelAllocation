export type FilterField    = 'orgName' | 'businessUnit' | 'division' | 'department' | 'group' | 'team'
export type FilterOperator = 'contains' | 'not-contains' | 'in' | 'not-in'

export const FILTER_FIELDS: readonly FilterField[] = [
  'orgName', 'businessUnit', 'division', 'department', 'group', 'team',
]

export const FILTER_FIELD_LABEL: Record<FilterField, string> = {
  orgName:      '組織名',
  businessUnit: '事業部',
  division:     '部門',
  department:   '統括部',
  group:        'グループ',
  team:         'チーム',
}

/** テキスト一部一致系の演算子（値は単一テキスト） */
export const TEXT_OPS = new Set<FilterOperator>(['contains', 'not-contains'])

/** リスト選択系の演算子（値は選択肢の配列） */
export const LIST_OPS = new Set<FilterOperator>(['in', 'not-in'])

export const FILTER_OP_LABEL: Record<FilterOperator, string> = {
  'contains':     'テキスト含む',
  'not-contains': 'テキスト含まない',
  'in':           'リスト選択',
  'not-in':       'リストから除く',
}

export interface FilterRule {
  id:       string
  field:    FilterField
  operator: FilterOperator
  /** contains/not-contains → 1要素のテキスト。in/not-in → 選択値リスト */
  values:   string[]
  /** true のとき、マッチした組織の配下もすべて表示対象に含める */
  subtree:  boolean
}

export interface FilterCard {
  id:    string
  rules: FilterRule[]
}

export interface GlobalFilters {
  hasMembers:                   boolean
  includeRelatedSecondmentOrgs: boolean
  secondmentAnchors:            string[]
}

export const DEFAULT_GLOBAL_FILTERS: GlobalFilters = {
  hasMembers:                   false,
  includeRelatedSecondmentOrgs: false,
  secondmentAnchors:            [],
}

let _cardCounter = 0
let _ruleCounter = 0

export function makeFilterRule(partial?: Partial<FilterRule>): FilterRule {
  return {
    id:       `fr_${++_ruleCounter}`,
    field:    'orgName',
    operator: 'contains',
    values:   [],
    subtree:  false,
    ...partial,
  }
}

export function makeFilterCard(partial?: Partial<FilterCard>): FilterCard {
  return {
    id:    `fc_${++_cardCounter}`,
    rules: [makeFilterRule()],
    ...partial,
  }
}

export function cardIsEmpty(card: FilterCard): boolean {
  return card.rules.every(r => r.values.length === 0 && !r.subtree)
}
