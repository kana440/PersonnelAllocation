export type PathField = 'businessUnits' | 'divisions' | 'departments' | 'groups' | 'teams'

export const PATH_FIELDS: readonly PathField[] = [
  'businessUnits', 'divisions', 'departments', 'groups', 'teams',
] as const

export const PATH_FIELD_LABEL: Record<PathField, string> = {
  businessUnits: '関係部門',
  divisions:     '部門',
  departments:   '統括部',
  groups:        'グループ',
  teams:         'チーム',
}

export const ENTRY_FIELD: Record<PathField,
  'pathBusinessUnit' | 'pathDivision' | 'pathDepartment' | 'pathGroup' | 'pathTeam'
> = {
  businessUnits: 'pathBusinessUnit',
  divisions:     'pathDivision',
  departments:   'pathDepartment',
  groups:        'pathGroup',
  teams:         'pathTeam',
}

export interface FilterCard {
  id:             string
  // 階層パスフィルタ（同一カード内 AND、カード間 OR）
  businessUnits:  string[]
  divisions:      string[]
  departments:    string[]
  groups:         string[]
  teams:          string[]
  // サブツリーフィルタ（org IDの配下を強制表示）
  subtreeOrgIds:  string[]
}

export interface GlobalFilters {
  hasMembers:                    boolean   // 人・ポジションあり（デフォルト true）
  includeRelatedSecondmentOrgs:  boolean   // 表示中の組織の出向者用組織も表示
  secondmentAnchors:             string[]  // 特定の org ID + その出向者用組織を強制表示
}

export const DEFAULT_GLOBAL_FILTERS: GlobalFilters = {
  hasMembers:                   true,
  includeRelatedSecondmentOrgs: false,
  secondmentAnchors:            [],
}

let _cardCounter = 0
export function makeFilterCard(partial?: Partial<FilterCard>): FilterCard {
  return {
    id: `fc_${++_cardCounter}`,
    businessUnits: [], divisions: [], departments: [], groups: [], teams: [],
    subtreeOrgIds: [],
    ...partial,
  }
}

export function lowerFields(field: PathField): PathField[] {
  return PATH_FIELDS.slice(PATH_FIELDS.indexOf(field) + 1) as PathField[]
}

export function cardIsEmpty(card: FilterCard): boolean {
  return PATH_FIELDS.every(f => card[f].length === 0) && card.subtreeOrgIds.length === 0
}
