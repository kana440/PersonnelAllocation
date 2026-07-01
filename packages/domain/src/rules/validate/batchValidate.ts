/**
 * validate/batchValidate.ts — 全行一括バリデーション（1万行対応）
 *
 * validateRow()（単一行・フォーム文脈）とは別に、
 * エクスポート前・Review 表示・インポート後など「全件を一度に検証する」場面で使う。
 *
 * パフォーマンス設計:
 *
 *   RowRule (C/W 系): validateRow() 内で ROW_RULES ループが走る。
 *                     rowRuleCtx をバッチ全体で 1 インスタンス共有し渡すことで、
 *                     orgMasterByCode 等の高コスト計算を 1 回に抑える。
 *
 *   InterRowRule    : validateAll() 呼び出し。各ルールが内部で O(R) index を構築。
 *                     ナイーブな O(R²) スキャンを回避する。
 *
 *   allocationList:[] を validateRow に渡すことで
 *                     validateExclusivity (E1) と validateGlobalConsistency の
 *                     W3（O(R²) 部分）をスキップし、それらは INTER_ROW_RULES が担う。
 */

import type { AllocationRow }   from '../../allocationRow'
import type { Organization }    from '../../schemas'
import type { AllMasters }      from '../../masters/aggregate'
import type { ValidationIssue } from './types'
import { validateRow }          from './validateRow'
import { RowRuleCtx }            from '../rowRule'
import { INTER_ROW_RULES }       from '../interRowRule'

// 登録を確実に実行するため side-effect import
import '../interRow/index'

// ── 結果の型 ─────────────────────────────────────────────────────────────────

/** 全件バリデーション結果。rowId → そのRowのIssue一覧 */
export type BatchValidateResult = Map<number, ValidationIssue[]>

// ── 内部ヘルパー ──────────────────────────────────────────────────────────────

function addIssues(
  result:  BatchValidateResult,
  rowId:   number,
  issues:  ValidationIssue[],
): void {
  if (issues.length === 0) return
  const existing = result.get(rowId)
  if (existing) existing.push(...issues)
  else result.set(rowId, [...issues])
}

// ── メイン関数 ───────────────────────────────────────────────────────────────

/**
 * allocationList 全件のバリデーションを O(R) で実行する。
 *
 * @param allocationList  検証対象の全行
 * @param masters         コードリスト
 * @param afterOrganizations 組織マスタ（ツリー計算・orgCode 照合に使用）
 * @returns rowId をキーとする Issue マップ（issue がない行はエントリなし）
 */
export function validateAllRows(
  allocationList:      readonly AllocationRow[],
  masters:             AllMasters,
  afterOrganizations:  Organization[],
): BatchValidateResult {
  const result: BatchValidateResult = new Map()

  // RowRuleCtx: バッチ全体で 1 インスタンスを共有（lazy getter でコスト共有）
  const rowRuleCtx = new RowRuleCtx(masters, afterOrganizations)

  // ── FieldRule + RowRule + A/B/D2/F/G ─────────────────────────────────────
  // allocationList:[] で呼ぶことで:
  //   - validateExclusivity (E系 O(R²)) をスキップ → INTER_ROW_RULES が担う
  //   - validateGlobalConsistency の W3 (O(R²)) をスキップ → INTER_ROW_RULES が担う
  //   - ROW_RULES (C1〜C4, W2) は validateRow 内で rowRuleCtx を使って評価
  for (const row of allocationList) {
    const issues = validateRow({
      row,
      afterOrganizations,
      masters,
      allocationList: [],   // ← 空にして E系・W3 をスキップ
      rowRuleCtx,           // ← バッチ全体で共有する RowRuleCtx
    })
    addIssues(result, row.rowId, issues)
  }

  // ── InterRowRule（全件 O(R) 評価）────────────────────────────────────────
  // E1（上司チェーン）・E2（positionCode 重複）・W3（上司組織）など
  // allocationList 間の整合性を各ルールが index を構築して O(R) で評価する。
  for (const rule of INTER_ROW_RULES) {
    if (rule.scope !== 'state') continue
    for (const [rowId, issues] of rule.validateAll(allocationList, rowRuleCtx)) {
      addIssues(result, rowId, issues)
    }
  }

  return result
}

// ── ユーティリティ ────────────────────────────────────────────────────────────

/** バリデーション結果から error レベルの issue を持つ行だけを返す */
export function rowsWithErrors(result: BatchValidateResult): number[] {
  const ids: number[] = []
  for (const [rowId, issues] of result) {
    if (issues.some(i => i.level === 'error')) ids.push(rowId)
  }
  return ids
}

/** バリデーション結果から warning/error のどちらかを持つ行数を返す */
export function issueRowCount(result: BatchValidateResult): { error: number; warning: number } {
  let error = 0
  let warning = 0
  for (const issues of result.values()) {
    const hasError   = issues.some(i => i.level === 'error')
    const hasWarning = issues.some(i => i.level === 'warning')
    if (hasError)   error++
    if (hasWarning && !hasError) warning++
  }
  return { error, warning }
}
