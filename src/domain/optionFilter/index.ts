// ドメイン層の選択肢生成・絞り込みロジック。
// VALUE_RULES を単一ソースとして参照する。
// jobType のみ currentJobFamily コンテキストが必要なためカスタム処理。

import type { AllocationRow } from '../allocationRow'
import type { AllCodeLists } from '../codeLists/aggregate'
import { VALUE_RULES, getEffectiveSource } from '../valueRules'

// ── ベース選択肢の組み立て ───────────────────────────────────────────────────

/**
 * フィールド名と codeLists からベース選択肢リストを返す。
 * 行の状態による絞り込みは行わない。
 */
export function buildBaseOptions(
  field:             string,
  codeLists:         AllCodeLists,
  currentJobFamily?: string,
): string[] {
  // jobType: 親子フィルタが必要なためカスタム処理
  if (field === 'jobType') {
    const parent   = codeLists.jobFamilies.find(jf => jf.label === currentJobFamily)
    const filtered = parent
      ? codeLists.subJobFamilies.filter(s => s.jobFamilyCode === parent.code)
      : codeLists.subJobFamilies
    return filtered.map(s => s.label)
  }

  // その他: VALUE_RULES の一般ルール（when なし）から source を取得
  const general = VALUE_RULES.find(r => r.field === (field as keyof AllocationRow) && !r.when)
  return general ? general.source(codeLists) : []  // general rules do not need row
}

// ── 絞り込み ─────────────────────────────────────────────────────────────────

/**
 * 行の状態に応じてベース選択肢を絞り込む。
 * VALUE_RULES の条件付きルール（when あり）が一致すればその source を返す。
 * 一致しなければ base をそのまま返す（参照同一）。
 */
export function filterOptions(
  field:     string,
  row:       AllocationRow,
  base:      string[],
  codeLists: AllCodeLists,
): string[] {
  const effective = getEffectiveSource(field as keyof AllocationRow, row, codeLists)
  // effective が base と同じ内容（条件ルールなし）なら base を返す
  // getEffectiveSource は条件ルールが優先なので、条件付きルールが存在すれば上書きされる
  if (effective === null) return base
  // 条件付きルールが適用された場合は effective を返す（base を無視）
  const hasConditional = VALUE_RULES.some(
    r => r.field === (field as keyof AllocationRow) && r.when && r.when(row, codeLists)
  )
  return hasConditional ? effective : base
}

// ── 主エントリポイント ───────────────────────────────────────────────────────

/**
 * ベース選択肢の組み立てと絞り込みを合成した主エントリポイント。
 * UI 層の getOptions() はこれを呼ぶ。
 */
export function getFieldOptions(
  field:             string,
  row:               AllocationRow,
  codeLists:         AllCodeLists,
  currentJobFamily?: string,
): string[] {
  // 条件付きルールが適用される場合は直接返す（ベース構築不要）
  const hasConditional = VALUE_RULES.some(
    r => r.field === (field as keyof AllocationRow) && r.when && r.when(row, codeLists)
  )
  if (hasConditional) {
    const effective = getEffectiveSource(field as keyof AllocationRow, row, codeLists)  // passes row to source
    if (effective) return effective
  }

  return buildBaseOptions(field, codeLists, currentJobFamily)
}
