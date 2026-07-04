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

/**
 * 氏名検索用の正規化。normalizeSearch に加えて:
 * - スペース除去（「田中 太郎」と「田中太郎」を同一視）
 * - ひらがな→カタカナ変換（ふりがなの入力方式を統一）
 *
 * クエリと対象の両方に同じ関数を適用することで、
 * 「スペースなし入力」「ひらがなでのふりがな検索」が成立する。
 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .toLowerCase()
}
