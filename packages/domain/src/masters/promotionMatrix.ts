// 昇降格マトリクス — 職務レベル × 役職 × M職P職 → 昇降格ワーニング用チェック
export interface PromotionMatrixEntry {
  jobLevel:         string  // 職務レベル
  officialPosition: string  // 役職
  jobClass:         string  // M職P職（'M' | 'P' | '' など）
  warningLevel:     number  // 昇降格ワーニング用チェック（段階数）
}
