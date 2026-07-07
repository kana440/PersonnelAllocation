// パネル未実測時（仮想化で一度も画面に出ていない）の高さ見積もり。
// ResizeObserver による実測が届くまでの間、computeLayout・接続線・可視判定に使う。
// 完全な実測値の代わりにはならないが、固定値（旧 EST_WIN_H）よりはるかに実態に近い。

export const EST_HEADER_H = 40   // パネルヘッダーの高さ
export const EST_ROW_H    = 60   // RowCard/BeforeRowCard 1件あたりの推定高さ（ツリー形式）

const EST_GROUP_LABEL_H = 18     // コンパクト形式のグループラベル行の高さ
const EST_CHIP_ROW_H    = 22     // コンパクト形式のチップ1行分の高さ
const EST_CHIP_W        = 90     // チップ1件あたりの推定幅（折り返し行数の見積もりに使う）

/** ツリー形式: 行数 × 行高さ推定値 */
export function estimateTreeBodyHeight(rowCount: number): number {
  return Math.max(1, rowCount) * EST_ROW_H
}

/**
 * コンパクト(バンド)形式: グループキーごとに人数を数え、パネル幅から折り返し行数を見積もって合計する。
 * groupKeys は各行のグループキー（compactGroupDef.getKey/getPrevKey の適用結果）の配列。
 */
export function estimateBandBodyHeight(groupKeys: string[], bodyWidth: number): number {
  if (groupKeys.length === 0) return EST_CHIP_ROW_H
  const counts = new Map<string, number>()
  for (const key of groupKeys) counts.set(key, (counts.get(key) ?? 0) + 1)
  const itemsPerRow = Math.max(1, Math.floor(bodyWidth / EST_CHIP_W))
  let total = 0
  for (const count of counts.values()) {
    total += EST_GROUP_LABEL_H + Math.ceil(count / itemsPerRow) * EST_CHIP_ROW_H
  }
  return total
}
