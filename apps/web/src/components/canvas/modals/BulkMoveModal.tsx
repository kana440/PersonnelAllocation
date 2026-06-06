import { useState } from 'react'
import { OrgCombobox } from '../../common/OrgCombobox'
import type { Organization } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Person } from '@personnel/domain/schemas'

export interface BulkMoveConfirmParams {
  mode:           'positions' | 'persons'
  selectedIds:    Set<number>
  targetId:       string
  retireOriginal: boolean
}

interface PositionEntry { row: AllocationRow; person: Person | null; depth: number }
interface MemberEntry   { row: AllocationRow; person: Person }

interface BulkMoveModalProps {
  sourceOrg:    Organization | undefined
  moveableOrgs: Organization[]
  posEntries:   PositionEntry[]
  personList:   MemberEntry[]
  onConfirm:    (params: BulkMoveConfirmParams) => void
  onCancel:     () => void
}

export function BulkMoveModal({ sourceOrg, moveableOrgs, posEntries, personList, onConfirm, onCancel }: BulkMoveModalProps) {
  const [mode,           setMode]           = useState<'positions' | 'persons'>('persons')
  const [selectedIds,    setSelectedIds]    = useState<Set<number>>(new Set())
  const [targetId,       setTargetId]       = useState<string>('')
  const [retireOriginal, setRetireOriginal] = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const listItems: Array<{ rowId: number; label: string; sub?: string }> = mode === 'positions'
    ? posEntries.map(({ row, person }) => ({
        rowId: row.rowId,
        label: row.localJobTitle || row.officialPositionCode || `（${row.positionCode ?? '役職未設定'}）`,
        sub:   person?.name ?? '（空席）',
      }))
    : personList.map(({ row, person }) => ({
        rowId: row.rowId,
        label: person.name,
        sub:   row.localJobTitle || row.officialPositionCode || '（役職未設定）',
      }))

  const allChecked = listItems.length > 0 && listItems.every(i => selectedIds.has(i.rowId))
  const toggleAll  = () => setSelectedIds(allChecked ? new Set() : new Set(listItems.map(i => i.rowId)))
  const toggleItem = (rowId: number) => setSelectedIds(prev => {
    const next = new Set(prev); next.has(rowId) ? next.delete(rowId) : next.add(rowId); return next
  })

  const handleConfirm = () => {
    if (!targetId)           { setError('移動先を選択してください'); return }
    if (selectedIds.size === 0) { setError('移動対象を選択してください'); return }
    onConfirm({ mode, selectedIds, targetId, retireOriginal })
  }

  const handleModeChange = (m: 'positions' | 'persons') => {
    setMode(m); setSelectedIds(new Set()); setError(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* ヘッダー */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="text-sm font-bold text-gray-800 mb-2">{sourceOrg?.name} の移動</div>
          <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg w-fit">
            {(['positions', 'persons'] as const).map(m => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${mode === m ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {m === 'positions' ? 'ポジションごと移動' : '人だけ移動（ポジション新設）'}
              </button>
            ))}
          </div>
          {mode === 'persons' && (
            <p className="text-xs text-gray-400 mt-1.5">移動先に同じ役職名でポジションを新設し、レポートラインを再現します</p>
          )}
        </div>

        {/* 選択リスト */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {listItems.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-4">対象がありません</div>
          ) : (
            <>
              <label className="flex items-center gap-2 pb-2 border-b border-gray-100 mb-2 cursor-pointer">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-blue-600" />
                <span className="text-xs font-medium text-gray-600">全選択（{listItems.length}件）</span>
              </label>
              <div className="space-y-1">
                {listItems.map(item => (
                  <label key={item.rowId} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.rowId)}
                      onChange={() => toggleItem(item.rowId)}
                      className="accent-blue-600 flex-shrink-0"
                    />
                    <span className="text-xs font-medium text-gray-800 flex-1 truncate">{item.label}</span>
                    {item.sub && <span className="text-xs text-gray-400 flex-shrink-0">{item.sub}</span>}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-4 border-t border-gray-100 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">移動先組織</label>
            <OrgCombobox
              allOrgs={moveableOrgs}
              value={targetId || null}
              onChange={id => { setTargetId(id ?? ''); setError(null) }}
              placeholder="組織を選択…"
              variant="light"
              className="w-full"
            />
          </div>
          {mode === 'persons' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={retireOriginal} onChange={e => setRetireOriginal(e.target.checked)} className="accent-blue-600" />
              <span className="text-xs text-gray-600">元のポジションを廃止する</span>
            </label>
          )}
          {error && <div className="text-xs text-red-600">{error}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="px-3 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">
              キャンセル
            </button>
            <button
              onClick={handleConfirm}
              disabled={!targetId || selectedIds.size === 0}
              className="px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              移動する（{selectedIds.size}件）
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
