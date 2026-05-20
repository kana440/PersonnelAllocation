import { useStore } from '../store/useStore'
import { rowDiff } from '../domain/allocationRow'

// 社員IDで絞った AllocationRow 一覧を表示し、行を選択すると RowEditorPanel が開く
export function PersonRowList() {
  const {
    persons, allocationList, afterOrganizations,
    selectedPersonId, selectedRowId, selectRow, clearPersonSelection,
  } = useStore()

  const person = persons.find(p => p.id === selectedPersonId)
  if (!person) return null

  const rows = allocationList.filter(r => r.userId === person.sfPersonId)

  if (rows.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <PersonHeader person={person} onBack={clearPersonSelection} />
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
          この人物の行データがありません
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PersonHeader person={person} onBack={clearPersonSelection} />

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {rows.map(row => {
          const diffs    = rowDiff(row)
          const hasDiff  = diffs.length > 0
          const org      = afterOrganizations.find(o => o.externalCode === row.departmentCode || o.id === row.departmentCode)
          const isSelected = row.rowId === selectedRowId

          return (
            <button
              key={row.rowId}
              onClick={() => selectRow(row.rowId)}
              className={`w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors ${
                isSelected ? 'bg-blue-100 ring-1 ring-inset ring-blue-300' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                {/* 変更ステータスドット */}
                <span className={`flex-shrink-0 w-2 h-2 rounded-full ${hasDiff ? 'bg-blue-500' : 'bg-gray-300'}`} />

                <div className="flex-1 min-w-0">
                  {/* 組織 + 種別 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700 truncate">
                      {org?.name ?? row.departmentCode ?? '（組織未設定）'}
                    </span>
                    {row.concurrentType && (
                      <span className="text-xs text-purple-600 flex-shrink-0">
                        {row.concurrentType}
                      </span>
                    )}
                  </div>

                  {/* 差分サマリー */}
                  {hasDiff ? (
                    <div className="text-xs text-blue-600 mt-0.5 truncate">
                      → {diffs.slice(0, 3).map(d => d.afterKey).join(', ')}
                      {diffs.length > 3 && ` 他${diffs.length - 3}件`}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 mt-0.5">変更なし</div>
                  )}
                </div>

                {/* 行番号 */}
                <span className="flex-shrink-0 text-xs text-gray-400">#{row.rowId}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PersonHeader({ person, onBack }: { person: { name: string; sfPersonId?: string }; onBack: () => void }) {
  return (
    <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 bg-white flex items-center gap-2">
      <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-700">← 戻る</button>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-gray-800 truncate">{person.name}</div>
        {person.sfPersonId && (
          <div className="text-xs text-gray-400 truncate">{person.sfPersonId}</div>
        )}
      </div>
    </div>
  )
}
