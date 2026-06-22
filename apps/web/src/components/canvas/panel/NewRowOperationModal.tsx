import type { EditOperation } from '@personnel/domain/commands/defs/index'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { OperationFormView } from '../../editor/PersonOperationPanel/OperationFormView'

interface Props {
  def:      EditOperation
  /** 追加先組織の departmentCode（SF externalCode） */
  orgCode:  string
  onClose:  () => void
}

/**
 * 組織パネルの追加ボタンから新規行を作成するモーダル。
 * 既存行を持たない操作（rowId = -1）のため、OperationFormView に合成行を渡す。
 * onOpen は row.departmentCode を初期値として使う。
 */
export function NewRowOperationModal({ def, orgCode, onClose }: Props) {
  // 合成行: departmentCode だけ設定。onOpen が組織コードを初期値として拾う
  const syntheticRow = { rowId: -1, departmentCode: orgCode } as AllocationRow

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center select-text"
      onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[520px] max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center px-3 py-2 border-b border-gray-200 bg-blue-50 rounded-t-xl">
          <span className="flex-1 text-[11px] font-semibold text-blue-700">{def.label}</span>
          <button
            onClick={onClose}
            className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors text-xs"
            title="閉じる"
          >✕</button>
        </div>
        <OperationFormView def={def} row={syntheticRow} onBack={onClose} />
      </div>
    </div>
  )
}
