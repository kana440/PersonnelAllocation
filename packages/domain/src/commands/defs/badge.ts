/**
 * 操作・変更パターンのバッジ意味分類。
 * UI 側でこの型から表示色を導出する（domain は色を知らない）。
 *
 * - positive:   昇格・復職・追加など前向き変更
 * - negative:   降格・解除・離脱・ネガティブ方向の変更
 * - transfer:   組織異動・組織改変・上司変更（中立的な移動）
 * - jobChange:  職務・役職・雇用形態変更
 * - secondment: 出向系（開始・解除を含む出向カテゴリ）
 * - concurrent: 兼務系（追加・解除を含む兼務カテゴリ）
 * - neutral:    変化なし・在籍状況管理
 */
export type OperationBadge =
  | 'positive'
  | 'negative'
  | 'transfer'
  | 'jobChange'
  | 'secondment'
  | 'concurrent'
  | 'neutral'
