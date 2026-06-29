import { normalizeSearch }  from './normalizeSearch'
import type { Organization } from '@personnel/domain/schemas'

export interface ScoredOrg {
  org:   Organization
  score: number  // 3=完全一致 / 2=片方を含む / <1=バイグラム類似率
}

/**
 * 旧組織名に対して新組織リストをバイグラム類似度でスコアリングして返す。
 * 廃止済み(isAbandoned)は除外する。score > 0.1 のみ返す。
 */
export function scoreOrgCandidates(
  queryName: string,
  orgs:      Organization[],
  topN = 8,
): ScoredOrg[] {
  const nq = normalizeSearch(queryName)
  return orgs
    .filter(o => !o.isAbandoned)
    .map(org => ({ org, score: orgNameSimilarity(nq, normalizeSearch(org.name)) }))
    .filter(({ score }) => score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}

/**
 * 組織名の類似度スコア（引数は正規化済み文字列を想定）。
 * 正規化前の文字列を渡してもよい（内部で normalizeSearch は呼ばない）。
 */
export function orgNameSimilarity(a: string, b: string): number {
  if (!a || !b)              return 0
  if (a === b)               return 3
  if (a.includes(b) || b.includes(a)) return 2
  const bigrams = (s: string) => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
  }
  const ba = bigrams(a)
  const bb = bigrams(b)
  let common = 0
  for (const g of ba) if (bb.has(g)) common++
  return common / Math.max(ba.size + bb.size - common, 1)
}
