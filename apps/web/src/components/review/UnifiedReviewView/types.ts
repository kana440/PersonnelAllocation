import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import type { ValidationResolutionDef } from '@personnel/domain/rules/resolve'
import type { AllocationRow } from '@personnel/domain/allocationRow'

export type ViewMode = 'diff' | 'side-by-side'

export interface UnifiedFilter {
  searchField:     string
  searchText:      string
  changedOnly:     boolean
  issuesOnly:      boolean
  activePatterns:  Set<EditPattern>
  /** IssueGroupDef.key でフィルタ（'' = なし） */
  activeIssueKey:  string
  /** 詳細条件（フィールドごとの AND 絞り込み）。値が空文字/undefined のフィールドは無視 */
  fieldConditions: Partial<Record<string, string>>
}

export const DEFAULT_FILTER: UnifiedFilter = {
  searchField:     '__all__',
  searchText:      '',
  changedOnly:     false,
  issuesOnly:      false,
  activePatterns:  new Set(),
  activeIssueKey:  '',
  fieldConditions: {},
}

export interface IssueGroupDef {
  /** グルーピングキー: id がある場合は `${id}::${field}`、ない場合は message */
  key:             string
  message:         string
  field:           string
  level:           'error' | 'warning'
  rowIds:          number[]
  /** issue.suggestedPatch から取得。確定的な修正値が存在する場合に設定する（ワンクリック修正用） */
  suggestedPatch?: Partial<AllocationRow>
  /** RESOLUTION_DEFS.filter() で取得した全修正案（空配列の場合は汎用ドロップダウンにフォールバック） */
  resolutionDefs:  ValidationResolutionDef[]
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
