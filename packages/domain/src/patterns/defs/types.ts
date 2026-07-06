import type { AllocationRow } from '../../allocationRow'
import type { DetectContext } from '../detection/helpers'
import type { OperationBadge } from '../../commands/defs/badge'

export interface EditPatternMeta {
  label:        string
  addLabel:     string
  editLabel:    string
  /** チップ表示用の短縮ラベル。NavBar・キャンバス・テーブルで共通使用 */
  chipLabel:    string
  badge:        OperationBadge
  group:        'jobClassification' | 'position' | 'person' | 'legacy'
  menuLabel?:   string
  /** パターン参照テーブル用の判定ロジック説明（1〜2文） */
  description?: string
  /** 標準プリセットでの初期表示。false = 上級者向け／細粒度のパターン */
  defaultVisible: boolean
  /** 変更パターンを検知する関数。noCheckRequired の場合は異動事由宣言ベースで判定する */
  detect: (row: AllocationRow, ctx: DetectContext) => boolean
}
