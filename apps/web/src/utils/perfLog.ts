// 性能調査用ログの共通しきい値。フレーム予算(16ms)の半分を超えたら気にする価値がある遅さとみなす。
// スクロール/ドラッグ中など高頻度に呼ばれる箇所でも、実際に重かったときだけログを出すために使う。
export const PERF_LOG_THRESHOLD_MS = 8

export function isSlowPerf(elapsedMs: number): boolean {
  return elapsedMs >= PERF_LOG_THRESHOLD_MS
}
