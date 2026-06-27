/**
 * 全角/半角を正規化してから小文字化する。
 * NFKC 正規化: 全角英数字→半角、半角カタカナ→全角カタカナ。
 * 検索クエリと対象文字列の両方に適用することで、全角・半角の区別なく検索できる。
 */
export function normalizeSearch(s: string): string {
  return s.normalize('NFKC').toLowerCase()
}

/** normalizeSearch を適用して includes 判定 */
export function matchesSearch(target: string, query: string): boolean {
  return normalizeSearch(target).includes(normalizeSearch(query))
}
