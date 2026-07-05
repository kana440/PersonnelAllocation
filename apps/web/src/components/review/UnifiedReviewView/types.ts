import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import type { ValidationResolutionDef } from '@personnel/domain/rules/resolve'

export type ViewMode = 'diff' | 'side-by-side'

export interface UnifiedFilter {
  searchField:        string
  searchText:         string
  changedOnly:        boolean
  issuesOnly:         boolean
  activePatterns:     Set<EditPattern>
  activeIssueMessage: string   // single-select; '' = none
  /** 詳細条件（フィールドごとの AND 絞り込み）。値が空文字/undefined のフィールドは無視 */
  fieldConditions:    Partial<Record<string, string>>
}

export const DEFAULT_FILTER: UnifiedFilter = {
  searchField:        '__all__',
  searchText:         '',
  changedOnly:        false,
  issuesOnly:         false,
  activePatterns:     new Set(),
  activeIssueMessage: '',
  fieldConditions:    {},
}

export interface IssueGroupDef {
  message:       string
  field:         string
  level:         'error' | 'warning'
  rowIds:        number[]
  /** domain 側の ValidationResolutionDef が見つかった場合に設定する */
  resolutionDef?: ValidationResolutionDef
}

export interface SearchFieldOption {
  value: string
  label: string
}

export interface DisplayField {
  afterKey: string
  prevKey:  string
  label:    string
}

/** 組織ヘッダー行 or データ行の判別型（混合仮想スクロール用） */
export type OrgTableItem =
  | {
      kind:      'org-header'
      orgId:     string | null
      orgName:   string
      orgPath:   string
      rowCount:  number
    }
  | {
      kind:      'row'
      reviewRow: import('../hooks/useReviewData').ReviewRow
    }
