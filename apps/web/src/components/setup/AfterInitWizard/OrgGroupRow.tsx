import { useState, useRef, useEffect, useMemo } from 'react'
import type { Organization }    from '@personnel/domain/schemas'
import type { OrgMappingGroup } from '../../../application/setup/afterInit'
import { matchesSearch, normalizeSearch } from '../../../utils/normalizeSearch'

interface Props {
  group:    OrgMappingGroup
  allOrgs:  Organization[]
  onChange: (prevCode: string | null, newOrgCode: string | null) => void
}

/** バイグラムによる名前類似度スコア（高いほど似ている） */
function nameSimilarity(a: string, b: string): number {
  const na = normalizeSearch(a)
  const nb = normalizeSearch(b)
  if (na === nb) return 3
  if (na.includes(nb) || nb.includes(na)) return 2
  const bigrams = (s: string) => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
  }
  const ba = bigrams(na)
  const bb = bigrams(nb)
  let common = 0
  for (const g of ba) if (bb.has(g)) common++
  return common / Math.max(ba.size + bb.size - common, 1)
}

/** スコープ組織の配下 ID セットを構築（BFS） */
function buildSubtreeIds(rootId: string, allOrgs: Organization[]): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const o of allOrgs) {
    if (o.parentId) {
      const arr = childrenOf.get(o.parentId) ?? []
      arr.push(o.id)
      childrenOf.set(o.parentId, arr)
    }
  }
  const result = new Set<string>()
  const queue = [rootId]
  while (queue.length > 0) {
    const id = queue.shift()!
    result.add(id)
    for (const child of childrenOf.get(id) ?? []) queue.push(child)
  }
  return result
}

export function OrgGroupRow({ group, allOrgs, onChange }: Props) {
  const { prevCode, prevOrgName, newOrgCode, matchConfidence, scopeOrgId, rowIds } = group

  const activeOrgs = allOrgs.filter(o => !o.isAbandoned)

  const isNewHire = prevCode === null

  const [search,   setSearch]   = useState('')
  const [open,     setOpen]     = useState(false)
  const [showAll,  setShowAll]  = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !panelRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // スコープ配下の ID セット（LCA 推論済みの場合のみ）
  const subtreeIds = useMemo(
    () => (scopeOrgId && !showAll) ? buildSubtreeIds(scopeOrgId, allOrgs) : null,
    [scopeOrgId, allOrgs, showAll],
  )

  const scopeOrg = useMemo(
    () => scopeOrgId ? (allOrgs.find(o => o.id === scopeOrgId) ?? null) : null,
    [scopeOrgId, allOrgs],
  )

  const selectedOrg = useMemo(
    () => activeOrgs.find(o => (o.externalCode ?? o.id) === newOrgCode) ?? null,
    [activeOrgs, newOrgCode],
  )

  const suggestions = useMemo(() => {
    const pool = subtreeIds
      ? activeOrgs.filter(o => subtreeIds.has(o.id))
      : activeOrgs

    if (search.trim()) {
      const results = pool.filter(o =>
        matchesSearch(o.name, search) ||
        (o.externalCode ? matchesSearch(o.externalCode, search) : false),
      )
      // スコープ内に候補がなければ全件へ自動フォールバック
      if (results.length === 0 && subtreeIds) {
        return activeOrgs.filter(o =>
          matchesSearch(o.name, search) ||
          (o.externalCode ? matchesSearch(o.externalCode, search) : false),
        )
      }
      return results
    }

    // 未入力: 旧組織名との類似度順で上位 15 件
    const base = prevOrgName ?? ''
    return [...pool]
      .sort((a, b) => nameSimilarity(b.name, base) - nameSimilarity(a.name, base))
      .slice(0, 15)
  }, [activeOrgs, search, prevOrgName, subtreeIds])

  const select = (code: string | null) => {
    onChange(prevCode, code)
    setSearch('')
    setOpen(false)
    setShowAll(false)
  }

  // ── 信頼度バッジ ─────────────────────────────────────────────────────────
  const confidenceBadge =
    matchConfidence === 'code' ? (
      <span className="text-[10px] text-green-600 font-medium flex-shrink-0">コード</span>
    ) : matchConfidence === 'name' ? (
      <span className="text-[10px] text-amber-600 font-medium flex-shrink-0">名前</span>
    ) : null

  // ── 行の背景色 ───────────────────────────────────────────────────────────
  const rowCls =
    matchConfidence === 'code'  ? 'border-green-200 bg-green-50'
    : matchConfidence === 'name' ? 'border-amber-200 bg-amber-50'
    :                              'border-orange-200 bg-orange-50'

  if (isNewHire) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs border border-gray-200 bg-gray-50">
        <div className="flex-1 min-w-0 text-gray-400 italic">（旧コードなし / 新入社員）</div>
        <span className="flex-shrink-0 text-gray-400">→</span>
        <span className="flex-shrink-0 w-48 text-gray-400 italic text-[10px]">後で個別設定</span>
        <span className="flex-shrink-0 text-[10px] text-gray-400 whitespace-nowrap">{rowIds.length}人</span>
        <span className="flex-shrink-0 text-[10px] w-4" />
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${rowCls}`}>

      {/* 旧組織 */}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate text-gray-700">{prevOrgName ?? prevCode}</div>
        {prevCode && prevOrgName !== prevCode && (
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">{prevCode}</div>
        )}
      </div>

      {confidenceBadge}

      <span className="flex-shrink-0 text-gray-400">→</span>

      {/* 新組織コンボボックス */}
      <div className="flex-shrink-0 w-52 relative">

        {/* スコープラベル（未マッチかつスコープあり） */}
        {matchConfidence === 'none' && scopeOrg && (
          <div className="text-[10px] text-blue-500 truncate mb-0.5 flex items-center gap-0.5">
            <span>📍</span>
            <span className="truncate">{scopeOrg.name}</span>
            {showAll && (
              <button
                onClick={() => setShowAll(false)}
                className="ml-auto flex-shrink-0 text-blue-400 hover:text-blue-600"
              >絞込</button>
            )}
          </div>
        )}

        {/* トリガー兼インライン入力 */}
        <div
          className={`flex items-center gap-1 w-full border rounded px-1.5 py-1 text-xs bg-white focus-within:border-blue-400 cursor-text ${
            newOrgCode
              ? matchConfidence === 'code'  ? 'border-green-300'
              : matchConfidence === 'name'  ? 'border-amber-300'
              :                               'border-blue-300'
              : 'border-orange-300'
          }`}
          onClick={() => { setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()) }}
        >
          {!open && selectedOrg && (
            <span className={`flex-1 truncate ${
              matchConfidence === 'code'  ? 'text-green-700'
              : matchConfidence === 'name' ? 'text-amber-700'
              :                              'text-blue-700'
            }`}>
              {selectedOrg.name}
            </span>
          )}
          {!open && !selectedOrg && (
            <span className="flex-1 text-orange-500">（後で設定）</span>
          )}
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={open ? '🔍 組織を検索…' : ''}
            className={`bg-transparent focus:outline-none text-xs text-gray-700 ${
              open ? 'flex-1 w-full' : 'w-0 h-0 opacity-0 absolute'
            }`}
          />
          <span className="flex-shrink-0 text-gray-400 text-[10px]">▾</span>
        </div>

        {/* ドロップダウン */}
        {open && (
          <div
            ref={panelRef}
            className="absolute top-full left-0 z-50 mt-0.5 w-64 bg-white border border-gray-200 rounded shadow-xl max-h-56 overflow-y-auto"
          >
            {/* 後で設定 */}
            <button
              onMouseDown={e => { e.preventDefault(); select(null) }}
              className={`w-full text-left px-2 py-1.5 text-xs border-b border-gray-100 ${
                !newOrgCode ? 'text-blue-700 font-semibold bg-blue-50' : 'text-gray-400 hover:bg-gray-50'
              }`}
            >
              （後で設定）
            </button>

            {/* 候補 */}
            {suggestions.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-2">該当なし</div>
            ) : (
              suggestions.map(o => {
                const code      = o.externalCode ?? o.id
                const isSelected = code === newOrgCode
                return (
                  <button
                    key={o.id}
                    onMouseDown={e => { e.preventDefault(); select(code) }}
                    className={`w-full text-left px-2 py-1 text-xs flex items-center gap-1.5 ${
                      isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-blue-50'
                    }`}
                  >
                    <span className="flex-1 truncate">{o.name}</span>
                    {o.externalCode && (
                      <span className="flex-shrink-0 text-[10px] text-gray-400 font-mono">{o.externalCode}</span>
                    )}
                  </button>
                )
              })
            )}

            {/* 全組織から検索トグル */}
            {subtreeIds && !showAll && (
              <button
                onMouseDown={e => { e.preventDefault(); setShowAll(true) }}
                className="w-full text-center px-2 py-1.5 text-[10px] text-blue-500 hover:bg-blue-50 border-t border-gray-100"
              >
                全組織から検索 ({activeOrgs.length}件)
              </button>
            )}
            {showAll && (
              <button
                onMouseDown={e => { e.preventDefault(); setShowAll(false) }}
                className="w-full text-center px-2 py-1.5 text-[10px] text-gray-400 hover:bg-gray-50 border-t border-gray-100"
              >
                絞り込みに戻す
              </button>
            )}
          </div>
        )}
      </div>

      {/* 人数バッジ */}
      <span className="flex-shrink-0 text-[10px] text-gray-400 whitespace-nowrap">{rowIds.length}人</span>

      {/* 状態アイコン */}
      <span className="flex-shrink-0 text-[10px] w-4 text-center">
        {newOrgCode ? '✓' : '⚠'}
      </span>
    </div>
  )
}
