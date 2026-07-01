/**
 * resolveRow — フィールド変更を受け取り、導出・バリデーション・選択肢を一括計算する。
 *
 * Phase 1: 収束ループ（導出）
 *   deriveFieldUpdates を「変化がなくなるまで」最大 MAX_ITER 回繰り返す。
 *   FIELD_RULES の value:'auto' ルール（source() が1件 → 自動セット）も同ループで処理する。
 *
 * Phase 2: バリデーション
 *   validateRow（共通バリデーション） + actionConstraints（操作固有制約）を評価する。
 *
 * Phase 3: 選択肢生成（遅延評価）
 *   State 制約（FIELD_RULES） → actionConstraints（方向フィルタ等） → Profile（stepMode 等）
 *   の順で絞り込み、{ valid, invalid } を返す。
 *
 * Profile: フィールドごとの source() を上書きする場面固有オーバーライド。
 *   source(masters, row) の引数順は FIELD_RULES と統一。
 */

import type { AllocationRow }   from './allocationRow'
import type { Organization }    from './schemas'
import type { AllMasters }      from './masters/aggregate'
import type { ValidationIssue } from './rules/validate/types'
import type { DerivedUpdates }  from './rules/derive/types'
import type { FieldRule, Profile } from './rules/field'
import { FIELD_RULES, evaluateFieldRule } from './rules/field'
import { deriveFieldUpdates }   from './rules/derive'
import { getGroupedFieldOptions, type OptionsGroup } from './rules/options'
import { validateRow }          from './rules/validate/validateRow'

export type { Profile, FieldRule, ProfileEntry } from './rules/field'

// ── コンテキスト型 ────────────────────────────────────────────────────────────

export interface ResolveContext {
  readonly masters:            AllMasters
  readonly allocationList:     readonly AllocationRow[]
  readonly afterOrganizations: readonly Organization[]
  /**
   * この操作固有のアクション制約（State 制約である FIELD_RULES の拡張）。
   * prevXxx フィールドを参照して「変更の文脈」を表現できる。
   *
   * Phase 2 (validation): 違反があれば ValidationIssue を追加。
   * Phase 3 (options):    base.valid と交差させて有効選択肢を絞り込む。
   *                        Profile は最後に適用され、さらに step count 等を絞る。
   */
  readonly actionConstraints?: readonly FieldRule[]
}

// ── 戻り値型 ─────────────────────────────────────────────────────────────────

export interface ResolveResult {
  /** 導出を収束させた後の行状態 */
  row:        AllocationRow
  /** バリデーション結果（導出後の行に対して評価済み） */
  issues:     ValidationIssue[]
  /**
   * フィールドの有効・無効選択肢を返す（遅延評価）。
   * profile に source が定義されているフィールドはその関数で絞り込まれる。
   */
  getOptions: (field: string, jobFamily?: string) => OptionsGroup
}

// ── 内部定数 ─────────────────────────────────────────────────────────────────

const MAX_ITER = 10

// ── メイン関数 ───────────────────────────────────────────────────────────────

/**
 * @param row      変更を加える前の行状態
 * @param changes  適用するフィールド変更（空オブジェクト可）
 * @param ctx      マスタ・組織・allocationList 等のコンテキスト
 * @param profile  場面別の選択肢絞り込み・動作変更（省略可）
 */
export function resolveRow(
  row:      AllocationRow,
  changes:  DerivedUpdates,
  ctx:      ResolveContext,
  profile?: Profile,
): ResolveResult {
  const list = ctx.allocationList as AllocationRow[]

  // ── Phase 1: 収束ループ（導出）────────────────────────────────────────────
  // changes を currentRow に適用した状態を起点にして、
  // 連動導出が落ち着くまで繰り返す。
  let current   = { ...row, ...changes } as AllocationRow
  let lastDelta = changes

  for (let i = 0; i < MAX_ITER; i++) {
    const fromDerive = deriveFieldUpdates(
      lastDelta, current, ctx.masters, list,
    )

    // FIELD_RULES value:'auto': source() が1件のとき自動セット（deriveFieldUpdates が先行）
    const fromRuleAuto: Partial<AllocationRow> = {}
    for (const rule of FIELD_RULES) {
      if (rule.value !== 'auto') continue
      if (rule.when && !rule.when(current, ctx.masters)) continue
      const vals = rule.source(ctx.masters, current)
      if (vals.length !== 1) continue
      const fk = rule.field
      if (fk in fromDerive) continue  // deriveFieldUpdates が優先
      if ((current[fk] as unknown) !== vals[0]) {
        (fromRuleAuto as Record<string, unknown>)[fk as string] = vals[0]
      }
    }

    const derived = { ...fromDerive, ...fromRuleAuto } as DerivedUpdates

    // 実際に値が変わるキーがなければ収束済み
    const changed = Object.keys(derived).some(
      k => derived[k as keyof DerivedUpdates] !== current[k as keyof AllocationRow]
    )
    if (!changed) break

    current   = { ...current, ...derived } as AllocationRow
    lastDelta = derived
  }

  // ── Phase 2: バリデーション ────────────────────────────────────────────────
  const baseIssues = validateRow({
    row:                current,
    afterOrganizations: ctx.afterOrganizations as Organization[],
    masters:            ctx.masters,
    allocationList:     list,
  })

  // アクション制約の違反を追加（validation:'error'|'warning' のルールのみ）
  const actionIssues: ValidationIssue[] = (ctx.actionConstraints ?? [])
    .filter(r => r.validation !== 'none')
    .flatMap(r => evaluateFieldRule(r, current, ctx.masters))

  // Profile による warning → error 昇格
  // profile[field].validation === 'error' で特定フィールド、'*' キーで全フィールドを昇格
  const allIssues = [...baseIssues, ...actionIssues]
  const globalUpgrade = profile?.['*']?.validation === 'error'
  const issues = allIssues.map(issue => {
    if (issue.level !== 'warning') return issue
    if (globalUpgrade || profile?.[String(issue.field)]?.validation === 'error') {
      return { ...issue, level: 'error' as const }
    }
    return issue
  })

  // ── Phase 3: 選択肢生成（遅延評価、actionConstraints → profile の順で適用）────
  //
  // 適用順:
  //   1. base              = FIELD_RULES から生成（State 制約）
  //   2. actionConstraints = base.valid と交差（Action 制約・方向フィルタ等）
  //   3. profile           = constrainedValid をさらに絞り込む（stepMode 等 UI 動的状態）
  //
  // invalid の意味:
  //   - base.valid にあるが actionConstraints で除外されたもの → hidden（invalid にも出さない）
  //   - constrainedValid にあるが profile で除外されたもの     → invalid（薄く表示）
  const resolvedRow = current

  const getOptions = (field: string, jobFamily?: string): OptionsGroup => {
    const base = getGroupedFieldOptions(field, resolvedRow, ctx.masters, jobFamily)

    // Step 1: アクション制約との交差（base.valid を narrowing）
    let constrainedValid = base.valid
    for (const rule of (ctx.actionConstraints ?? [])) {
      if (String(rule.field) !== field) continue
      if (rule.when && !rule.when(resolvedRow, ctx.masters)) continue
      const allowed = new Set(rule.source(ctx.masters, resolvedRow))
      if (allowed.size > 0) {
        const narrowed = constrainedValid.filter(v => allowed.has(v))
        if (narrowed.length > 0) constrainedValid = narrowed
      }
    }

    // Step 2: Profile の適用（constrainedValid を起点に最終絞り込み）
    const override = profile?.[field]
    if (override?.source) {
      const profFiltered   = override.source(ctx.masters, resolvedRow)
      const constrainedSet = new Set(constrainedValid)
      // profile の結果のうち、アクション制約を通過したものだけを valid とする
      const finalValid     = profFiltered.filter(v => constrainedSet.has(v))
      const finalSet       = new Set(finalValid)
      return {
        valid:   finalValid,
        // constrainedValid の中で profile に除外されたもの = "方向は正しいが step 範囲外"
        invalid: constrainedValid.filter(v => !finalSet.has(v)),
      }
    }

    // Profile なし: actionConstraints のみ適用した結果を返す
    if (constrainedValid !== base.valid) {
      const constrainedSet = new Set(constrainedValid)
      return {
        valid:   constrainedValid,
        invalid: base.valid.filter(v => !constrainedSet.has(v)),
      }
    }

    return base
  }

  return { row: current, issues, getOptions }
}
