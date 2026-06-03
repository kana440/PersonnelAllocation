import type { AllocationRow } from '../allocationRow'

// ── パターン定義インターフェース ──────────────────────────────────────
export interface IOperationPattern {
  readonly id:             string   // 'secondment' | 'transfer' | 'promotion' | ...
  readonly name:           string   // '出向' | '異動' | '昇格'
  readonly requiredRowCount: 1 | 2

  /** 行群がこのパターンに該当するか判定 */
  match(rows: AllocationRow[]): PatternMatchResult

  /** パターン値を行群に適用して新しい行群を返す */
  apply(rows: AllocationRow[], values: PatternValues): AllocationRow[]
}

export interface PatternMatchResult {
  matched:    boolean
  confidence: number      // 0–1: AI への提案根拠として使用
  mismatches: string[]    // マッチしなかった理由（AI の説明文生成用）
}

export interface PatternValues {
  [fieldKey: string]: string | undefined
}

// ── キャッシュエントリ ────────────────────────────────────────────────
export interface PatternDetectionResult {
  groupEmployeeId: string         // グループ社員ID（一意キー）
  rows:            AllocationRow[]
  detected:        IOperationPattern | null
  candidates: Array<{
    pattern: IOperationPattern
    result:  PatternMatchResult
  }>
}

// AI ポートが返す提案
export interface AIPatternSuggestion {
  pattern:  IOperationPattern
  reason:   string         // 「出向元・出向先の2行構造に見えます」
  proposal: PatternValues  // 具体的な修正値
}
