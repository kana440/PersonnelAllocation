import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import type { ValidationResolutionDef } from '@personnel/domain/rules/resolve'
import type { AllocationRow } from '@personnel/domain/allocationRow'

export type ViewMode = 'diff' | 'side-by-side'

export interface UnifiedFilter {
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
  /** IssueTypeMeta.chipLabel — RowCard / SummaryView と共通の問題種別表示ラベル */
  chipLabel:       string
  /** IssueTypeMeta.description — ユーザー向けの説明文。チップのツールチップ等に使用 */
  description?:    string
  /** issue.suggestedPatch から取得。確定的な修正値が存在する場合に設定する（ワンクリック修正用） */
  suggestedPatch?: Partial<AllocationRow>
  /** RESOLUTION_DEFS.filter() で取得した全修正案（空配列の場合は汎用ドロップダウンにフォールバック） */
  resolutionDefs:  ValidationResolutionDef[]
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
      orgCode:   string
      orgName:   string
      orgPath:   string
      rowCount:  number
      /** このヘッダーが「旧」組織データ由来か（新モードのフォールバックは旧、旧モードの主軸は旧） */
      isOldSection: boolean
      /** 主軸で解決できず反対側（フォールバック）でグループ化した行か */
      isUnmapped:   boolean
    }
  | {
      kind:      'row'
      reviewRow: import('../hooks/useReviewData').ReviewRow
    }
