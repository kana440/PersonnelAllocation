import { useState, useRef, useEffect, useMemo } from 'react'
import type { Organization }    from '@personnel/domain/schemas'
import type { OrgMappingGroup } from '../../../application/setup/afterInit'
import { matchesSearch }   from '../../../utils/normalizeSearch'
import { orgNameSimilarity } from '../../../utils/orgMatching'

interface Props {
  group:              OrgMappingGroup
  allOrgs:            Organization[]
  /** 初期自動提案の新組織コード。行ごとの「提案に戻す」ボタンに使う */
  initialNewOrgCode?: string | null
  onChange:           (prevCode: string | null, newOrgCode: string | null) => void
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

export function OrgGroupRow({ group, allOrgs, initialNewOrgCode, onChange }: Props) {
  const { prevCode, prevOrgName, prevOrgPath, newOrgCode, matchConfidence, scopeOrgId, rowIds } = group

  const activeOrgs = allOrgs.filter(o => !o.isAbandoned)
  const isNewHire  = prevCode === null

  const [search,  setSearch]  = useState('')
  const [open,    setOpen]    = useState(false)
  const [showAll, setShowAll] = useState(false)
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

  /** 初期提案の組織（現在値と異なるときに「提案」ボタンに表示） */
  const initialProposalOrg = useMemo(
    () => initialNewOrgCode
      ? (activeOrgs.find(o => (o.externalCode ?? o.id) === initialNewOrgCode) ?? null)
      : null,
    [activeOrgs, initialNewOrgCode],
  )

  /** 提案組織の上位階層パス（フルパス表示） */
  const initialProposalPath = useMemo(() => {
    if (!initialProposalOrg) return null
    const byId = new Map(allOrgs.map(o => [o.id, o]))
    const ancestors: string[] = []
    let cur = initialProposalOrg.parentId ? byId.get(initialProposalOrg.parentId) : null
    while (cur) {
      ancestors.unshift(cur.name)
      cur = cur.parentId ? byId.get(cur.parentId) : null
    }
    return ancestors.length > 0 ? ancestors.join(' > ') : null
  }, [initialProposalOrg, allOrgs])

  const suggestions = useMemo(() => {
    const pool = subtreeIds
      ? activeOrgs.filter(o => subtreeIds.has(o.id))
      : activeOrgs

    if (search.trim()) {
      const results = pool.filter(o =>
        matchesSearch(o.name, search) ||
        (o.externalCode ? matchesSearch(o.externalCode, search) : false),
      )
      if (results.length === 0 && subtreeIds) {
        return activeOrgs.filter(o =>
          matchesSearch(o.name, search) ||
          (o.externalCode ? matchesSearch(o.externalCode, search) : false),
        )
      }
      return results
    }

    const base = prevOrgName ?? ''
    return [...pool]
      .sort((a, b) => orgNameSimilarity(b.name, base) - orgNameSimilarity(a.name, base))
      .slice(0, 15)
  }, [activeOrgs, search, prevOrgName, subtreeIds])

  const select = (code: string | null) => {
    onChange(prevCode, code)
    setSearch('')
    setOpen(false)
    setShowAll(false)
  }

  const confidenceBadge =
    matchConfidence === 'code' ? (
      <span className="text-[10px] text-green-600 font-medium flex-shrink-0">コード</span>
    ) : matchConfidence === 'name' ? (
      <span className="text-[10px] text-amber-600 font-medium flex-shrink-0">名前</span>
    ) : null

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
    <div className={`px-3 py-2.5 rounded-lg text-xs border ${rowCls}`}>

      {/* 上段: 旧組織名（折り返し可）+ 右端に人数・バッジ・状態 */}
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-700 leading-snug">
            {prevOrgName ?? prevCode}
            {prevCode && prevOrgName !== prevCode && (
              <span className="ml-1.5 text-[10px] text-gray-400 font-mono">{prevCode}</span>
            )}
          </div>
          {prevOrgPath && (
            <div className="text-[10px] text-gray-400 mt-0.5 truncate" title={prevOrgPath}>
              {prevOrgPath}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-px">
          <span className="text-[10px] text-gray-400 whitespace-nowrap">{rowIds.length}人</span>
          {confidenceBadge}
          <span className="text-[10px] w-4 text-center">{newOrgCode ? '✓' : '⚠'}</span>
        </div>
      </div>

      {/* 下段: → 新組織コンボ（全幅） */}
      <div className="flex items-start gap-1.5">
        <span className="flex-shrink-0 text-gray-400 mt-1">→</span>
        <div className="flex-1 min-w-0">

          {/* スコープラベル（未マッチかつスコープあり） */}
          {matchConfidence === 'none' && scopeOrg && (
            <div className="text-[10px] text-blue-500 mb-0.5 flex items-center gap-0.5">
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

          {/* コンボボックス本体（relative はここで切る） */}
          <div className="relative">
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

            {open && (
              <div
                ref={panelRef}
                className="absolute top-full left-0 z-50 mt-0.5 w-full min-w-[200px] bg-white border border-gray-200 rounded shadow-xl max-h-56 overflow-y-auto"
              >
                <button
                  onMouseDown={e => { e.preventDefault(); select(null) }}
                  className={`w-full text-left px-2 py-1.5 text-xs border-b border-gray-100 ${
                    !newOrgCode ? 'text-blue-700 font-semibold bg-blue-50' : 'text-gray-400 hover:bg-gray-50'
                  }`}
                >
                  （後で設定）
                </button>

                {suggestions.length === 0 ? (
                  <div className="text-xs text-gray-400 text-center py-2">該当なし</div>
                ) : (
                  suggestions.map(o => {
                    const code       = o.externalCode ?? o.id
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

          {/* 提案セクション: ラベル + 階層パス + 組織名ボタン */}
          {initialProposalOrg && initialNewOrgCode !== newOrgCode && (
            <div className="mt-1.5">
              <div className="text-[10px] text-gray-500 mb-0.5">
                提案
                {initialProposalPath && (
                  <span className="text-gray-400 ml-1">{initialProposalPath}</span>
                )}
              </div>
              <button
                onClick={() => select(initialNewOrgCode ?? null)}
                className="px-2 py-0.5 text-[11px] rounded border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors max-w-full truncate block"
              >
                {initialProposalOrg.name}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
