// ドメイン層の選択肢生成・絞り込みロジック。
// FIELD_CONSTRAINTS を単一ソースとして参照する。
// jobType のみ currentJobFamily コンテキストが必要なためカスタム処理。

import type { AllocationRow } from '../allocationRow'
import type { AllMasters } from '../masters/aggregate'
import { FIELD_CONSTRAINTS, getEffectiveSource } from '../fieldConstraints'

/** 条件付きルールが適用されたときの有効・無効の分類結果 */
export interface OptionsGroup {
  /** 現在の行状態に対して有効な選択肢 */
  valid:   string[]
  /** ベースリストには存在するが現在の条件では非推奨な選択肢 */
  invalid: string[]
}

// ── ベース選択肢の組み立て ───────────────────────────────────────────────────

/**
 * フィールド名と masters からベース選択肢リストを返す。
 * 行の状態による絞り込みは行わない。
 */
export function buildBaseOptions(
  field:             string,
  masters:         AllMasters,
  currentJobFamily?: string,
): string[] {
  // jobType: 親子フィルタが必要なためカスタム処理
  if (field === 'jobType') {
    const parent   = masters.jobFamilies.find(jf => jf.label === currentJobFamily)
    const filtered = parent
      ? masters.jobTypes.filter(s => s.jobFamilyCode === parent.code)
      : masters.jobTypes
    return filtered.map(s => s.label)
  }

  // その他: FIELD_CONSTRAINTS の一般ルール（when なし）から source を取得
  const general = FIELD_CONSTRAINTS.find(r => r.field === (field as keyof AllocationRow) && !r.when)
  return general ? general.source(masters) : []  // general rules do not need row
}

// ── 絞り込み ─────────────────────────────────────────────────────────────────

/**
 * 行の状態に応じてベース選択肢を絞り込む。
 * FIELD_CONSTRAINTS の条件付きルール（when あり）が一致すればその source を返す。
 * 一致しなければ base をそのまま返す（参照同一）。
 */
export function filterOptions(
  field:     string,
  row:       AllocationRow,
  base:      string[],
  masters: AllMasters,
): string[] {
  const effective = getEffectiveSource(field as keyof AllocationRow, row, masters)
  // effective が base と同じ内容（条件ルールなし）なら base を返す
  // getEffectiveSource は条件ルールが優先なので、条件付きルールが存在すれば上書きされる
  if (effective === null) return base
  // 条件付きルールが適用された場合は effective を返す（base を無視）
  const hasConditional = FIELD_CONSTRAINTS.some(
    r => r.field === (field as keyof AllocationRow) && r.when && r.when(row, masters)
  )
  return hasConditional ? effective : base
}

// ── 主エントリポイント ───────────────────────────────────────────────────────

/**
 * 有効・無効に分類した選択肢グループを返す。
 * 条件付きルールが適用される場合: valid = 条件合致、invalid = ベースのうち条件非合致
 * 条件付きルールがない場合: valid = ベース全件、invalid = []
 */
export function getGroupedFieldOptions(
  field:             string,
  row:               AllocationRow,
  masters:         AllMasters,
  currentJobFamily?: string,
): OptionsGroup {
  const base = buildBaseOptions(field, masters, currentJobFamily)
  const hasConditional = FIELD_CONSTRAINTS.some(
    r => r.field === (field as keyof AllocationRow) && r.when && r.when(row, masters)
  )
  if (!hasConditional) return { valid: base, invalid: [] }

  const effective = getEffectiveSource(field as keyof AllocationRow, row, masters)
  if (!effective || effective.length === 0) return { valid: base, invalid: [] }

  const effectiveSet = new Set(effective)
  return {
    valid:   effective,
    invalid: base.filter(o => !effectiveSet.has(o)),
  }
}

/**
 * 後方互換ラッパー: valid → invalid の順でフラットに返す。
 * AI ツール等の既存呼び出し側向け。
 */
export function getFieldOptions(
  field:             string,
  row:               AllocationRow,
  masters:         AllMasters,
  currentJobFamily?: string,
): string[] {
  const { valid, invalid } = getGroupedFieldOptions(field, row, masters, currentJobFamily)
  return [...valid, ...invalid]
}

// ── 昇降格バンド絞り込み ─────────────────────────────────────────────────────

/** 昇降格のステップ幅指定。'1'=1段階・'2'=2段階・'all'=制限なし */
export type StepMode = '1' | '2' | 'all'

/**
 * バンド選択肢を昇降格ステップ幅でフィルタする。
 *
 * direction が指定された場合はその方向のみ通過（'up'=上位・'down'=下位）。
 * direction が省略された場合は両方向を許容（PromotionDialog 等の昇降格兼用 UI 向け）。
 * promotionDemotionWarningLevel が 0 のバンドは候補から除外する。
 */
export function filterBandsByStep(
  options:   string[],
  baseBand:  string | undefined,
  masters:   AllMasters,
  stepMode:  StepMode,
  direction?: 'up' | 'down',
): string[] {
  if (stepMode === 'all' || !baseBand) return options
  const baseLevel = masters.jobLevels.find(e => e.label === baseBand)?.promotionDemotionWarningLevel ?? 0
  if (baseLevel === 0) return options
  const steps = parseInt(stepMode, 10)
  return options.filter(opt => {
    const optLevel = masters.jobLevels.find(e => e.label === opt)?.promotionDemotionWarningLevel ?? 0
    if (optLevel === 0) return false
    const diff = optLevel - baseLevel
    if (direction === 'up')   return diff >= 1 && diff <= steps
    if (direction === 'down') return diff >= -steps && diff <= -1
    return Math.abs(diff) >= 1 && Math.abs(diff) <= steps
  })
}

/**
 * 指定行の positionBand フィールドに対する昇降格候補バンドを返す。
 * FIELD_CONSTRAINTS の選択肢生成 + ステップフィルタを合成した AI / 操作 UI 向けヘルパー。
 */
export function getValidPositionBands(
  row:       AllocationRow,
  masters:   AllMasters,
  stepMode:  StepMode,
  direction?: 'up' | 'down',
): string[] {
  const { valid } = getGroupedFieldOptions('positionBand', row, masters)
  return filterBandsByStep(valid, row.positionBand as string | undefined, masters, stepMode, direction)
}
