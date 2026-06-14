import type { AllocationRow } from '../../allocationRow'
import type { AllCodeLists } from '../../masters/aggregate'

// 4色の意味:
// 緑  = ポジティブ方向（昇格・復職・移籍入）
// 青  = 中立変更・移動（異動・出向追加・兼務追加・職務変更・組織改変）
// 赤  = 解除・離脱・ネガティブ（各解除・降格・退職・移籍出・休職）
// グレー = 変化なし
export const C_GREEN = 'bg-green-100 text-green-700'
export const C_BLUE  = 'bg-blue-100 text-blue-700'
export const C_RED   = 'bg-red-100 text-red-600'
export const C_GRAY  = 'bg-gray-100 text-gray-500'

export function isOutsource(row: AllocationRow, cl: AllCodeLists): boolean {
  const et = row.employmentType as string | undefined
  if (!et) return false
  const entry = cl.employmentTypes.find(e => e.label === et || e.code === et)
  return entry?.isSecondmentAcceptance ?? false
}
