// オプション表示の厳密さ設定
//
// 'free'   : 自由入力。リスト外でもエラーなし・全選択肢を参考表示
// 'guide'  : 案内。有効を上・無効をグレーで下に表示・リスト外はエラーなし（Excelデフォルト）
// 'strict' : 厳格。無効は選択不可・リスト外はエラー（Phase 2 で実装）
export type FieldStrictness = 'free' | 'guide' | 'strict'

// デフォルトは 'strict'（現在の動作を維持）
// 個別フィールドを 'guide'/'free' に緩和したい場合は FIELD_STRICTNESS_DEFAULTS か
// canvasDisplayStore の fieldStrictnessOverrides で上書きする
export const GLOBAL_DEFAULT_STRICTNESS: FieldStrictness = 'strict'

// フィールドごとの静的デフォルト（未設定 → GLOBAL_DEFAULT_STRICTNESS）
const FIELD_STRICTNESS_DEFAULTS: Partial<Record<string, FieldStrictness>> = {
  // 必要に応じて追記する。例: band: 'guide',
}

/** ドメイン層のデフォルト解決（ユーザーオーバーライドなし） */
export function getFieldStrictness(field: string): FieldStrictness {
  return FIELD_STRICTNESS_DEFAULTS[field] ?? GLOBAL_DEFAULT_STRICTNESS
}

/** ユーザーオーバーライドを含めた解決（UI 層から呼ぶ） */
export function resolveFieldStrictness(
  field:     string,
  overrides: Partial<Record<string, FieldStrictness>>,
): FieldStrictness {
  return overrides[field] ?? getFieldStrictness(field)
}
