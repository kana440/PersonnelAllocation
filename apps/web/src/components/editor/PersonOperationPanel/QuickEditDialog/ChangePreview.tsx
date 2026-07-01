import { FIELD_METADATA }             from '@personnel/domain/allocationRow'
import { ALLOCATION_LIST_LABEL_MAP }  from '@personnel/domain/csvImport/allocationList/labels'
import type { AllocationRow }         from '@personnel/domain/allocationRow'

interface Props {
  anchorRow:    AllocationRow          // 操作対象の行
  originalList: AllocationRow[]        // 操作前リスト
  updatedList:  AllocationRow[]        // onSubmit が返した結果リスト
}

interface FieldDiff {
  label:  string
  before: string  // このセッションでの変更前
  after:  string  // このセッションでの変更後
  old:    string  // 旧（インポート基準 = prevXxx）
}

function rowDiffs(original: AllocationRow, updated: AllocationRow): FieldDiff[] {
  return FIELD_METADATA
    .filter(f => {
      const before = (original[f.after] as string | undefined) ?? ''
      const after  = (updated[f.after]  as string | undefined) ?? ''
      return before !== after
    })
    .map(f => ({
      label:  ALLOCATION_LIST_LABEL_MAP[f.after as string]?.ja ?? (f.after as string),
      before: (original[f.after]  as string | undefined) ?? '',
      after:  (updated[f.after]   as string | undefined) ?? '',
      old:    (original[f.before] as string | undefined) ?? '',
    }))
}

function personLabel(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

export function ChangePreview({ anchorRow, originalList, updatedList }: Props) {
  // 対象行の差分
  const anchorOriginal = originalList.find(r => r.rowId === anchorRow.rowId) ?? anchorRow
  const anchorUpdated  = updatedList.find(r  => r.rowId === anchorRow.rowId)
  const anchorDiffs    = anchorUpdated ? rowDiffs(anchorOriginal, anchorUpdated) : []

  // 副作用: 新規追加された行
  const originalIds = new Set(originalList.map(r => r.rowId))
  const addedRows   = updatedList.filter(r => !originalIds.has(r.rowId))

  // 副作用: 対象行以外の変更行（数のみ表示）
  const otherChangedCount = updatedList.filter(r =>
    r.rowId !== anchorRow.rowId &&
    originalIds.has(r.rowId) &&
    rowDiffs(originalList.find(o => o.rowId === r.rowId)!, r).length > 0,
  ).length

  const hasAnything = anchorDiffs.length > 0 || addedRows.length > 0 || otherChangedCount > 0

  if (!hasAnything) {
    return (
      <div className="px-5 py-3 bg-gray-50 border-t text-xs text-gray-400">
        変更なし
      </div>
    )
  }

  return (
    <div className="px-5 py-3 bg-gray-50 border-t overflow-y-auto max-h-52 space-y-3">
      {/* 対象行の変更 */}
      {anchorDiffs.length > 0 && (
        <div>
          {/* ヘッダー行 */}
          <div className="flex items-center gap-2 text-[9px] font-semibold text-gray-300 uppercase tracking-wider mb-1 pr-1">
            <span className="w-24 flex-shrink-0" />
            <span className="flex-1">変更前 → 変更後</span>
            <span className="w-20 flex-shrink-0 text-right border-l border-gray-200 pl-2">旧</span>
          </div>
          <div className="space-y-1">
            {anchorDiffs.map(d => {
              const sameAsOld = d.old !== '' && d.after === d.old
              return (
                <div key={d.label} className="flex items-center gap-2 text-xs min-w-0">
                  <span className="text-gray-500 w-24 flex-shrink-0 truncate">{d.label}</span>
                  {/* 変更前 → 変更後 */}
                  <span className="flex-1 flex items-center gap-1 min-w-0">
                    <span className="text-gray-400 line-through truncate">{d.before || '（空）'}</span>
                    <span className="text-gray-300 flex-shrink-0">→</span>
                    <span className="text-blue-600 font-medium truncate">{d.after || '（空）'}</span>
                  </span>
                  {/* 旧（右列） */}
                  <span className="w-20 flex-shrink-0 text-right border-l border-gray-200 pl-2 flex items-center justify-end gap-1">
                    <span className="text-gray-400 truncate text-[10px]">{d.old || '—'}</span>
                    {sameAsOld && (
                      <span className="text-green-600 flex-shrink-0" title="旧と同じ">✓</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 副作用: 新規行 */}
      {addedRows.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            新規追加（{addedRows.length}件）
          </div>
          <div className="space-y-1">
            {addedRows.map(r => (
              <div key={r.rowId} className="text-xs text-green-700 bg-green-50 rounded px-2 py-0.5">
                {r.userId
                  ? `${personLabel(r)}（${r.departmentCode ?? ''}）`
                  : `空席ポジション（${r.departmentCode ?? ''}）`}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 副作用: 他行変更の件数サマリー */}
      {otherChangedCount > 0 && (
        <div className="text-[10px] text-gray-400">
          他 {otherChangedCount} 件の行も更新されます（部下の上司コード更新等）
        </div>
      )}
    </div>
  )
}
