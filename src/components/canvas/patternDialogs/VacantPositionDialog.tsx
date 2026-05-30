import { useState, useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { appService } from '../../../application/HRApplicationService'
import type { AllocationRow } from '../../../domain/allocationRow'

interface Props {
  rowId:   number
  onClose: () => void
}

interface VacantEntry {
  row:     AllocationRow
  orgName: string
  title:   string
}

export function VacantPositionDialog({ rowId, onClose }: Props) {
  const { allocationList, afterOrganizations } = useStore()
  const row = allocationList.find(r => r.rowId === rowId)

  const [query,    setQuery]    = useState('')
  const [selected, setSelected] = useState<VacantEntry | null>(null)

  const vacantEntries = useMemo((): VacantEntry[] => {
    const orgByCode = new Map(afterOrganizations.map(o => [o.externalCode ?? '', o]))
    return allocationList
      .filter(r => r.positionCode && !r.userId && r.rowId !== rowId)
      .map(r => ({
        row:     r,
        orgName: (orgByCode.get(r.departmentCode ?? '')?.name) ?? (r.departmentCode ?? ''),
        title:   r.localJobTitle || r.officialPositionCode || (r.positionCode ?? ''),
      }))
  }, [allocationList, afterOrganizations, rowId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return vacantEntries
    return vacantEntries.filter(e =>
      e.title.toLowerCase().includes(q) ||
      (e.row.positionCode ?? '').toLowerCase().includes(q) ||
      e.orgName.toLowerCase().includes(q)
    )
  }, [vacantEntries, query])

  if (!row) return null

  const handleSave = () => {
    if (!selected) return
    appService.executeVacantPositionMove(rowId, selected.row.rowId)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[70vh]">
        <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <p className="text-sm font-semibold text-gray-700">空きポジションへ異動</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {[row.lastName, row.firstName].filter(Boolean).join(' ')}
          </p>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ポジション名・コード・組織名で絞り込み"
            className="mt-2 w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-8">
              {vacantEntries.length === 0 ? '空きポジションがありません' : '該当なし'}
            </div>
          ) : (
            filtered.map(entry => {
              const isSelected = selected?.row.rowId === entry.row.rowId
              return (
                <div
                  key={entry.row.rowId}
                  onClick={() => setSelected(entry)}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-50 transition-colors ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium truncate ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                      {entry.title}
                    </div>
                    <div className="text-[10px] text-gray-400 truncate">{entry.orgName}</div>
                  </div>
                  <span className={`text-[10px] font-mono flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`}>
                    {entry.row.positionCode}
                  </span>
                  {isSelected && (
                    <span className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center text-white text-[9px] flex-shrink-0">✓</span>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-2 flex-shrink-0">
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!selected}
            className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {selected ? `「${selected.title}」に異動` : '異動先を選択してください'}
          </button>
        </div>
      </div>
    </div>
  )
}
