import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import type { UserSession } from '../../application/userSession'
import type { ImportMode, AssigneeImportMode } from '../../application/importMerge'

export const SCHEMA_VERSION = 1

/**
 * マージ/リベースの進行中レビュー1行分。key は行の No.（AllocationRow.no）。
 * incomingRow は「適用する行の全体（候補値）」。added/modified で使用し、
 * removed（確認のみ・データ変更なし）では undefined。
 * incomingRow はレビュー中にインライン編集される（承認前ならいつでも修正可能）。
 *
 * status の遷移（1段階の承認。承認した瞬間に allocationList へ反映される）:
 *   pending → committed  （added/modified: 承認 → 実データに反映。終端状態）
 *   pending → confirmed  （removed: 承認 → データ変更なしの確認のみ。終端状態）
 *   pending → rejected   （added/modified のみ: 却下。取り込まない・再提出も求めない。終端状態）
 *   pending → returned   （added/modified のみ: 差し戻し。担当者に再提出を依頼。終端状態）
 * rejected/returned は removed には使わない（削除しない運用のため、removed は confirmed のみ）。
 */
export interface MergeSessionRow {
  key:          string
  kind:         'added' | 'removed' | 'modified'
  incomingRow?: AllocationRow
  status:       'pending' | 'committed' | 'confirmed' | 'rejected' | 'returned'
}

/**
 * 進行中のマージ/リベースセッション。ワークスペース本体（PersistedPayload）の
 * 一部として持たせることで、STEP2で「セッションが進行中のマージ状態を持てる」構造に
 * 自然に対応できるようにする（専用の永続化ストアは作らない）。
 */
export interface MergeSession {
  mode:           'merge' | 'rebase'
  sourceFileName: string
  importedAt:     string
  /** merge モードのみ */
  importMode?:     ImportMode
  assigneeMode?:   AssigneeImportMode
  /**
   * merge モードのみ。提出ファイルの組織マスタ（新/旧）件数が現在のセッションと異なる場合の警告文。
   * 組織改編後に配布された古いファイルが混在している可能性を示すための非ブロッキング警告。
   */
  masterMismatchWarning?: string
  rows:           MergeSessionRow[]
  /**
   * rebase モードのみ。実編集のない行（Prevとの差分なし）はレビューを待たず
   * セッション開始時に即座に allocationList へ反映済み。その件数（透明性のため画面に表示する）。
   */
  autoAppliedCount?: number
  /**
   * セッション開始時点（≒ファイル読込直後、rebase の自動反映も含めた副作用が起きる前）の
   * allocationList のスナップショット。「このレビューを破棄」で完全ロールバックするために使う
   * （git の merge --abort と同じ意味を持たせるため）。
   */
  baselineAllocationList?: AllocationRow[]
}

/** マージ/リベース履歴1行分の結果サマリー（セッション終了時に記録・行の詳細は消えるため） */
export interface MergeHistoryRowSummary {
  key:       string
  kind:      MergeSessionRow['kind']
  outcome:   'committed' | 'confirmed' | 'rejected' | 'returned' | 'abandoned'
  /** returned のときの差し戻し先（incomingRow.assignee をそのまま使う） */
  assignee?: string
}

/** 終了した（リリース or 破棄された）マージ/リベースセッションの記録 */
export interface MergeHistoryEntry {
  mode:           'merge' | 'rebase'
  sourceFileName: string
  importedAt:     string
  endedAt:        string
  endReason:      'released' | 'discarded'
  rows:           MergeHistoryRowSummary[]
}

export interface PersistedPayload {
  schemaVersion:       number
  savedAt:             string
  allocationList:      AllocationRow[]
  beforeOrganizations: Organization[]
  afterOrganizations:  Organization[]
  masters:             AllMasters
  effectiveDate:       string
  userSession:         UserSession
  /** 読み込んだ Excel ファイル名（ヘッダー表示・再開リスト表示用） */
  fileName:            string | null
  /** 進行中のマージ/リベースレビュー（なければ null） */
  pendingMerge:        MergeSession | null
  /** 終了したマージ/リベースセッションの履歴（新しい順。上限あり） */
  mergeHistory:        MergeHistoryEntry[]
}

export interface WorkspaceMeta {
  id:            string
  savedAt:       string
  effectiveDate: string
  rowCount:      number
  assigneeName:  string | null
  role:          'admin' | 'assignee'
  fileName:      string | null
}
