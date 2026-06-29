import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal }        from 'react-dom'
import type { Organization }   from '@personnel/domain/schemas'
import { matchesSearch }       from '../../../utils/normalizeSearch'
import { scoreOrgCandidates }  from '../../../utils/orgMatching'
import type { ScoredOrg }      from '../../../utils/orgMatching'

interface Props {
  orgName:            string
  rowCount:           number
  afterOrganizations: Organization[]
  onSelect:           (orgId: string) => void
  onClose:            () => void
}

function buildOrgPath(org: Organization, byId: Map<string, Organization>): string {
  const parts: string[] = []
  let cur: Organization | undefined = org.parentId ? byId.get(org.parentId) : undefined
  while (cur) {
    parts.unshift(cur.name)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return parts.join(' > ')
}

export function AssignOrgModal({ orgName, rowCount, afterOrganizations, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const orgById = useMemo(
    () => new Map(afterOrganizations.map(o => [o.id, o])),
    [afterOrganizations],
  )

  const scored: ScoredOrg[] = useMemo(
    () => scoreOrgCandidates(orgName, afterOrganizations),
    [orgName, afterOrganizations],
  )

  const scoreMap = useMemo(
    () => new Map(scored.map(s => [s.org.id, s.score])),
    [scored],
  )

  const searchResults = useMemo(() => {
    if (!query.trim()) return null
    return afterOrganizations
      .filter(o => !o.isAbandoned && (
        matchesSearch(o.name, query) ||
        (o.externalCode ? matchesSearch(o.externalCode, query) : false)
      ))
      .slice(0, 30)
  }, [query, afterOrganizations])

  const displayOrgs = searchResults ?? scored.map(s => s.org)

  const handleSelect = (orgId: string) => { onSelect(orgId); onClose() }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl flex flex-col w-[480px]"
        style={{ maxHeight: '70vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── ヘッダー ── */}
        <div className="px-4 py-3 border-b flex-shrink-0">
          <div className="font-semibold text-sm text-gray-800">移動先を選択</div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            旧組織:&nbsp;<span className="font-medium text-gray-700">{orgName}</span>
            &nbsp;（{rowCount}名）
          </div>
        </div>

        {/* ── 検索バー ── */}
        <div className="px-3 py-2 border-b flex-shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="組織名またはコードで検索..."
            className="w-full text-sm border border-gray-300 rounded px-2.5 py-1 outline-none focus:border-blue-400"
          />
        </div>

        {/* ── セクションラベル ── */}
        <div className="px-3 py-1 text-[10px] text-gray-400 font-medium bg-gray-50 border-b flex-shrink-0">
          {searchResults
            ? `検索結果 ${searchResults.length}件`
            : `提案（「${orgName}」との類似度順 上位${scored.length}件）`
          }
        </div>

        {/* ── リスト ── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {displayOrgs.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-gray-400">
              {query.trim() ? '該当なし' : '提案候補がありません'}
            </div>
          ) : displayOrgs.map(org => {
            const score = scoreMap.get(org.id)
            const path  = buildOrgPath(org, orgById)
            return (
              <button
                key={org.id}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 flex items-start gap-2"
                onClick={() => handleSelect(org.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-gray-800 font-medium truncate">{org.name}</div>
                  {path && (
                    <div className="text-[10px] text-gray-400 truncate">{path}</div>
                  )}
                  {org.externalCode && (
                    <div className="text-[10px] text-gray-400 font-mono">{org.externalCode}</div>
                  )}
                </div>
                {score != null && !query && <ScoreBadge score={score} />}
              </button>
            )
          })}
        </div>

        {/* ── フッター ── */}
        <div className="px-4 py-2 border-t flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ScoreBadge({ score }: { score: number }) {
  if (score >= 3) return (
    <span className="flex-shrink-0 self-center text-[9px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
      完全一致
    </span>
  )
  if (score >= 2) return (
    <span className="flex-shrink-0 self-center text-[9px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
      部分一致
    </span>
  )
  return (
    <span className="flex-shrink-0 self-center text-[9px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
      {Math.round(score * 100)}%
    </span>
  )
}
