import { useState, useMemo } from 'react'
import { normalizeSearch } from '../../../utils/normalizeSearch'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization }  from '@personnel/domain/schemas'
import { OrgTreePanel }       from '../../review/components/OrgTreePanel'

interface Props {
  allocationList:     AllocationRow[]
  afterOrganizations: Organization[]
  /** 開いたときに選択済みにする組織 ID（省略時は未選択） */
  initialOrgId?:      string
  /** true のとき在席ありの行のみ表示（上司選択用）。デフォルト false */
  occupiedOnly?:      boolean
  /** positionFilter を事前評価した述語。省略時は全候補が対象 */
  filter?:            (candidate: AllocationRow) => boolean
  /** 選択確定時のコールバック。personName は在席者の氏名（空席は空文字） */
  onSelect:           (posCode: string, personName: string) => void
  onClose:            () => void
}

function displayName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ')
}

export function PositionPickerModal({
  allocationList, afterOrganizations,
  initialOrgId, occupiedOnly = false,
  filter, onSelect, onClose,
}: Props) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(initialOrgId ?? null)
  const [search,        setSearch]        = useState('')

  const orgById = useMemo(
    () => new Map(afterOrganizations.map(o => [o.id, o])),
    [afterOrganizations],
  )
  const orgByCode = useMemo(
    () => new Map(afterOrganizations.flatMap(o => o.externalCode ? [[o.externalCode, o]] : [])),
    [afterOrganizations],
  )

  const candidates = useMemo(
    () => allocationList.filter(r =>
      !!r.positionCode &&
      (!occupiedOnly || !!r.userId) &&
      (!filter || filter(r))
    ),
    [allocationList, occupiedOnly, filter],
  )

  const displayed = useMemo(() => {
    const q = normalizeSearch(search.trim())
    if (q) {
      return candidates.filter(r => {
        const name = normalizeSearch(displayName(r))
        const code = normalizeSearch(r.positionCode as string)
        return name.includes(q) || code.includes(q)
      })
    }
    if (!selectedOrgId) return []
    const extCode = orgById.get(selectedOrgId)?.externalCode
    if (!extCode) return []
    return candidates.filter(r => r.departmentCode === extCode)
  }, [candidates, search, selectedOrgId, orgById])

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-[720px] h-[500px] flex flex-col">

        {/* ヘッダー */}
        <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
          <span className="text-sm font-semibold text-gray-800">ポジションを選択</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* 検索 */}
        <div className="px-4 py-2 border-b flex-shrink-0">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedOrgId(null) }}
            placeholder="氏名・ポジションコードで検索..."
            className="w-full text-xs border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-blue-400"
            autoFocus
          />
        </div>

        {/* 本体 */}
        <div className="flex flex-1 overflow-hidden">

          {/* 左：組織ツリー */}
          <div className="w-52 border-r overflow-y-auto flex-shrink-0">
            <OrgTreePanel
              orgs={afterOrganizations}
              selectedId={selectedOrgId ?? undefined}
              onSelectOrg={id => { setSelectedOrgId(id); setSearch('') }}
              placeholder="🔍 組織で絞り込み"
            />
          </div>

          {/* 右：ポジション一覧 */}
          <div className="flex-1 overflow-y-auto">
            {displayed.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-10">
                {search
                  ? '該当するポジションがありません'
                  : '左の組織を選択するか、上で氏名・コードを検索してください'}
              </p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium w-32">氏名</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium w-24">役職</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium w-36">ポジションコード</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">組織</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(r => {
                    const org  = orgByCode.get(r.departmentCode as string)
                    const name = displayName(r)
                    return (
                      <tr
                        key={r.rowId}
                        className="hover:bg-blue-50 cursor-pointer border-b border-gray-50 transition-colors"
                        onClick={() => onSelect(r.positionCode as string, name)}
                      >
                        <td className="px-3 py-2 font-medium text-gray-700">{name || '（空席）'}</td>
                        <td className="px-3 py-2 text-gray-500">{(r.officialPositionCode as string) || '—'}</td>
                        <td className="px-3 py-2 font-mono text-gray-400 text-[10px]">{r.positionCode as string}</td>
                        <td className="px-3 py-2 text-gray-400 truncate">{org?.name ?? ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
