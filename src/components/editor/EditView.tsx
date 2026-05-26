import { useStore } from '../../store/useStore'
import { rowDiff } from '../../domain/allocationRow'
import { RowEditorPanel } from './RowEditorPanel'

export function EditView({ readOnly = false }: { readOnly?: boolean }) {
  const {
    allocationList, persons, afterOrganizations,
    selectedPersonId, selectedRowId,
    selectRow,
  } = useStore()

  const person = persons.find(p => p.id === selectedPersonId)

  // 同一人物の全行（userId で紐付け）
  const rows = person?.sfPersonId
    ? allocationList.filter(r => r.userId === person.sfPersonId)
    : selectedRowId !== null
    ? allocationList.filter(r => r.rowId === selectedRowId)
    : []

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── メイン ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* 行セレクター: 複数行のときのみ表示 */}
        {rows.length > 1 && (
          <div className="flex-shrink-0 w-44 border-r border-gray-200 overflow-y-auto bg-gray-50">
            <div className="px-2 py-1 text-xs font-semibold text-gray-500 border-b border-gray-200 bg-gray-100">
              行を選択 ({rows.length}件)
            </div>
            {rows.map(row => {
              const diffs = rowDiff(row)
              const org = afterOrganizations.find(
                o => o.externalCode === row.departmentCode || o.id === row.departmentCode
              )
              const isSelected = row.rowId === selectedRowId
              return (
                <button
                  key={row.rowId}
                  onClick={() => selectRow(row.rowId)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                    isSelected ? 'bg-blue-100 ring-1 ring-inset ring-blue-300' : 'bg-white'
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      diffs.length > 0 ? 'bg-blue-500' : 'bg-gray-300'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-700 truncate">
                        {org?.name ?? row.departmentCode ?? '（組織未設定）'}
                      </div>
                      {row.concurrentType && (
                        <div className="text-xs text-purple-600 truncate">{row.concurrentType}</div>
                      )}
                      <div className={`text-xs mt-0.5 truncate ${diffs.length > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                        {diffs.length > 0 ? `${diffs.length}件の変更` : '変更なし'}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* エディタ */}
        <div className="flex-1 overflow-hidden min-h-0 bg-white">
          {selectedRowId !== null ? (
            <RowEditorPanel readOnly={readOnly} />
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-gray-400">
              この人物の発令データがありません
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-gray-400">
              ← 行を選択してください
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
