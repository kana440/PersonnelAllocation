/**
 * interRowRule.ts — 複数行スコープのルール定義
 *
 * E系（キー重複・上司参照整合）・出向整合性など、
 * 1 行単独では判定できない複数行間のロジックを宣言する場所。
 *
 * パフォーマンス設計（1万行対応）:
 *
 *   ナイーブな実装（行ごとに allocationList をスキャン）は O(R²) になる。
 *   10,000行 × 10,000行 = 1億 ops → 数十秒 = 論外。
 *
 *   InterRowRule は 2 種の評価モードを持つ:
 *
 *   validateAll()  ← バッチ文脈（全件チェック）で使用。
 *                     内部で index を O(R) 構築 → 全行評価 O(R)。合計 O(R)。
 *
 *   buildIndex()   ← フォーム編集文脈で事前に呼ぶ。
 *   validateRow()     index は ResolveContext.interRowIndexes に保持して使い回す。
 *                     1 行評価は O(1)。
 *
 *   index の型はルールごとに異なるため defineInterRowRule<TIndex> でカプセル化する。
 *   パブリック型 InterRowRule では index: unknown として扱う。
 */

import type { AllocationRow }   from '../allocationRow'
import type { ValidationIssue } from './validate/types'
import type { RowRuleCtx }      from './rowRule'

// ── InterRowRule ───────────────────────────────────────────────────────────────

export interface InterRowRule {
  readonly id:    string
  /**
   * 'state' : 常時評価
   * 'action': 操作フォームが開いているときのみ評価
   */
  readonly scope: 'state' | 'action'

  /**
   * allocationList から O(R) で index を構築する。
   * 返値の型はルール実装が知っている（外部からは unknown として扱う）。
   *
   * フォーム編集文脈では executeOperation / セッション開始時に呼び、
   * 結果を ResolveContext.interRowIndexes に格納して使い回す。
   */
  buildIndex(allocationList: readonly AllocationRow[]): unknown

  /**
   * 単一行バリデーション（フォーム編集文脈）。
   * index は buildIndex() で構築済みのものを渡す（O(1) ルックアップ）。
   * ctx は RowRuleCtx（masters / org 計算の共有）。
   */
  validateRow(row: AllocationRow, index: unknown, ctx: RowRuleCtx): ValidationIssue[]

  /**
   * 全行の一括バリデーション（バッチ文脈）。
   * 内部で buildIndex() → validateAll を O(R) で完結させる。
   * Map<rowId, issues[]> を返す（issues が空の行はエントリ不要）。
   *
   * validateAll() の実装は O(R) を保証しなければならない。
   * （行ごとに allocationList を線形スキャンしてはいけない）
   */
  validateAll(
    allocationList: readonly AllocationRow[],
    ctx:            RowRuleCtx,
  ): Map<number, ValidationIssue[]>
}

// ── 型安全ファクトリ ──────────────────────────────────────────────────────────

/**
 * InterRowRule を型安全に定義するファクトリ。
 *
 * TIndex で index の型を指定する。実装内では型安全に扱え、
 * パブリック型の InterRowRule（index: unknown）へ安全にキャストする。
 *
 * @example
 * type MyIndex = Map<string, AllocationRow>
 *
 * export const myRule = defineInterRowRule<MyIndex>({
 *   id:    'MyRule',
 *   scope: 'state',
 *   buildIndex: (list) => new Map(list.filter(r => r.positionCode).map(r => [r.positionCode!, r])),
 *   validateRow: (row, index, ctx) => { ... index.get(row.positionCode) ... },
 *   validateAll: (list, ctx) => {
 *     const index = new Map(...)
 *     const result = new Map<number, ValidationIssue[]>()
 *     for (const row of list) { ... }
 *     return result
 *   },
 * })
 */
export function defineInterRowRule<TIndex>(def: {
  readonly id:    string
  readonly scope: 'state' | 'action'
  buildIndex (allocationList: readonly AllocationRow[]): TIndex
  validateRow(row: AllocationRow, index: TIndex, ctx: RowRuleCtx): ValidationIssue[]
  validateAll(allocationList: readonly AllocationRow[], ctx: RowRuleCtx): Map<number, ValidationIssue[]>
}): InterRowRule {
  return {
    id:          def.id,
    scope:       def.scope,
    buildIndex:  (list)             => def.buildIndex(list),
    validateRow: (row, index, ctx)  => def.validateRow(row, index as TIndex, ctx),
    validateAll: (list, ctx)        => def.validateAll(list, ctx),
  }
}

// ── INTER_ROW_RULES ───────────────────────────────────────────────────────────

/**
 * 登録済み InterRowRule の一覧。
 * validateAllRows()（validate/batchValidate.ts）と resolveRow()（resolver.ts）が参照する。
 *
 * 現在の登録:
 *   interRow/managerChain.ts  — E1: 上司ポジション存在・自己参照・循環チェック
 *   interRow/managerOrg.ts    — W3: 上司が直系上位組織以外に所属していないかチェック
 *   interRow/positionUniq.ts  — E2: positionCode 重複チェック
 */
export const INTER_ROW_RULES: InterRowRule[] = []
