import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../../../store/useStore'
import type { ReviewRow } from '../hooks/useReviewData'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'

const ALL_FILTER_CHIPS: { key: EditPattern; label: string; color: string }[] = [
  { key: 'orgTransfer',           label: '別組織へ異動',       color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { key: 'orgRestructure',        label: '組織コード変更(組改)', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { key: 'promotion',             label: '昇格',               color: 'bg-green-100 text-green-700 border-green-200' },
  { key: 'demotion',              label: '降格',               color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { key: 'titleChange',           label: '役職変更',           color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { key: 'jobTypeChange',         label: 'ジョブタイプ変更',   color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { key: 'secondmentOut',         label: '本務出向',           color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { key: 'secondmentIn',          label: '本務出向受入',       color: 'bg-amber-50 text-amber-600 border-amber-100' },
  { key: 'secondmentOutRelease',  label: '本務出向解除',       color: 'bg-red-100 text-red-600 border-red-200' },
  { key: 'secondmentInRelease',   label: '本務出向受入解除',   color: 'bg-red-100 text-red-600 border-red-200' },
  { key: 'leaveOfAbsence',        label: '休職',               color: 'bg-gray-100 text-gray-600 border-gray-200' },
  { key: 'returnFromLeave',       label: '復職',               color: 'bg-gray-100 text-gray-600 border-gray-200' },
  { key: 'concurrentAdd',         label: '兼務追加',           color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { key: 'positionChange',        label: 'Pos変更',            color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { key: 'employmentTransfer',    label: '移籍',               color: 'bg-red-50 text-red-600 border-red-100' },
  { key: 'noChange',              label: '変更なし',           color: 'bg-neutral-100 text-neutral-500 border-neutral-200' },
  { key: 'termination',           label: '退職',               color: 'bg-red-100 text-red-700 border-red-200' },
]

interface Props {
  rows:                ReviewRow[]
  filterKind?:         string       // ダイジェストからのジャンプ時の初期選択
  filterIssues?:       boolean
  defaultChangedOnly?: boolean      // "変更あり" カードからのナビゲーション
}

function DiffCell({ before, after }: { before: string; after: string }) {
  const changed = before !== after
  return (
    <td className="px-2 py-1.5 text-xs border-b border-gray-100 whitespace-nowrap">
      {changed ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-blue-700 font-medium">{after || '—'}</span>
          <span className="text-gray-400 line-through text-[10px]">{before || '—'}</span>
        </div>
      ) : (
        <span className="text-gray-600">{after || '—'}</span>
      )}
    </td>
  )
}

export function AttributeGrid({ rows, filterKind, filterIssues, defaultChangedOnly }: Props) {
  const { afterOrganizations, beforeOrganizations } = useStore()

  const [showChangedOnly, setShowChangedOnly] = useState(!!filterKind || !!filterIssues || !!defaultChangedOnly)
  const [showIssuesOnly,  setShowIssuesOnly]  = useState(!!filterIssues)
  const [activeKinds,     setActiveKinds]     = useState<Set<EditPattern>>(
    filterKind ? new Set([filterKind as EditPattern]) : new Set()
  )
  const [search, setSearch] = useState('')

  // ダイジェストから再ナビゲーション時に同期
  useEffect(() => {
    if (filterKind) {
      setActiveKinds(new Set([filterKind as EditPattern]))
      setShowChangedOnly(true)
    }
  }, [filterKind])

  const toggleKind = (key: EditPattern) =>
    setActiveKinds(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const afterOrgByCode  = useMemo(() =>
    new Map(afterOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o])),
    [afterOrganizations]
  )
  const beforeOrgByCode = useMemo(() =>
    new Map(beforeOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o])),
    [beforeOrganizations]
  )

  const filtered = useMemo(() => {
    let list = rows
    if (showChangedOnly) list = list.filter(r => r.changes.diffCount > 0)
    if (showIssuesOnly)  list = list.filter(r => r.issues.length > 0)
    if (activeKinds.size > 0) {
      list = list.filter(r => [...activeKinds].some(k => r.activePatterns.has(k)))
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        (r.row.lastName ?? '').toLowerCase().includes(q) ||
        (r.row.firstName ?? '').toLowerCase().includes(q) ||
        (r.row.userId ?? '').toLowerCase().includes(q) ||
        (r.row.departmentCode ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [rows, showChangedOnly, showIssuesOnly, activeKinds, search])

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── ツールバー（1行、横スクロール） ── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50 overflow-x-auto">
        <input
          type="text"
          placeholder="名前・ID・組織"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-shrink-0 border border-gray-300 rounded px-2 py-0.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-blue-300"
        />
        <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer select-none flex-shrink-0 whitespace-nowrap">
          <input type="checkbox" checked={showChangedOnly} onChange={e => setShowChangedOnly(e.target.checked)} />
          変更のみ
        </label>
        <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer select-none flex-shrink-0 whitespace-nowrap">
          <input type="checkbox" checked={showIssuesOnly} onChange={e => setShowIssuesOnly(e.target.checked)} />
          問題のみ
        </label>
        <div className="flex-shrink-0 w-px h-4 bg-gray-300 mx-0.5" />
        {ALL_FILTER_CHIPS.map(({ key, label, color }) => {
          const active = activeKinds.has(key)
          return (
            <button
              key={key}
              onClick={() => toggleKind(key)}
              className={`flex-shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-medium transition-all cursor-pointer select-none whitespace-nowrap ${
                active
                  ? `${color} shadow-sm ring-1 ring-inset ring-current`
                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          )
        })}
        {activeKinds.size > 0 && (
          <button
            onClick={() => setActiveKinds(new Set())}
            className="flex-shrink-0 text-[10px] text-gray-400 hover:text-gray-600 underline whitespace-nowrap"
          >
            クリア
          </button>
        )}
        <span className="ml-auto flex-shrink-0 text-[10px] text-gray-400 pl-2 whitespace-nowrap">{filtered.length} 件</span>
      </div>

      {/* ── テーブル ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-gray-100 z-10">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">氏名</th>
              <th className="px-2 py-2 text-left font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">ユーザーID</th>
              <th className="px-2 py-2 text-left font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">組織（新→旧）</th>
              <th className="px-2 py-2 text-left font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">職位名（新→旧）</th>
              <th className="px-2 py-2 text-left font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">バンド（新→旧）</th>
              <th className="px-2 py-2 text-left font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">変更種別</th>
              <th className="px-2 py-2 text-left font-medium text-red-600 border-b border-gray-200 whitespace-nowrap">問題</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ row, changes, activePatterns, issues }) => {
              const afterOrgName  = row.departmentCode     ? (afterOrgByCode.get(row.departmentCode)?.name  ?? row.departmentCode)     : '—'
              const beforeOrgName = row.prevDepartmentCode ? (beforeOrgByCode.get(row.prevDepartmentCode)?.name ?? row.prevDepartmentCode) : '—'
              const hasIssue = issues.length > 0
              return (
                <tr key={row.rowId} className={hasIssue ? 'bg-red-50' : 'hover:bg-gray-50'}>
                  <td className="px-2 py-1.5 border-b border-gray-100 whitespace-nowrap font-medium">{row.lastName}{row.firstName}</td>
                  <td className="px-2 py-1.5 border-b border-gray-100 text-gray-500 whitespace-nowrap">{row.userId ?? '—'}</td>
                  <DiffCell before={beforeOrgName} after={afterOrgName} />
                  <DiffCell before={row.prevLocalJobTitle ?? ''} after={row.localJobTitle ?? ''} />
                  <DiffCell before={row.prevBand ?? ''} after={row.band ?? ''} />
                  <td className="px-2 py-1.5 border-b border-gray-100 whitespace-nowrap">
                    <div className="flex flex-wrap gap-0.5">
                      {ALL_FILTER_CHIPS.map(({ key, label, color }) => {
                        return activePatterns.has(key)
                          ? <span key={key} className={`px-1 py-0.5 rounded text-[10px] border ${color}`}>{label}</span>
                          : null
                      })}
                      {changes.bandMismatch && (
                        <span className="px-1 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 border border-amber-200">⚠Band</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 border-b border-gray-100">
                    {issues.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {issues.map((issue, i) => (
                          <div key={i} className={`text-[10px] ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
                            {issue.message}
                          </div>
                        ))}
                      </div>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">該当なし</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
