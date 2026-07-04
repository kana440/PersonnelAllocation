import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRowSelectionStore }     from '../../../store/rowSelectionStore'
import { useStore }                 from '../../../store/useStore'
import { useUICommandStore }        from '../../../store/uiCommandStore'
import { appService }               from '../../../application/HRApplicationService'
import { MoveRowsToOrgOperation }   from '@personnel/domain/commands/handlers/moveRowsToOrg'
import { OrgPickerModal }           from '../../common/OrgPickerModal'
import { BulkFieldEditModal }       from '../components/BulkFieldEditModal'

/**
 * Review テーブルで行が1件以上選択されているときに表示する操作バー。
 *
 * - 組織異動 / 異動事由 — 複数行可
 * - 上司変更 / 昇格 / 降格 — 1件のみ（uiCommandStore 経由で PersonOperationPanel の操作フォームへ直接遷移）
 */
export function SelectionActionBar() {
  const { selectedRowIds, clearSelection } = useRowSelectionStore(
    useShallow(s => ({ selectedRowIds: s.selectedRowIds, clearSelection: s.clearSelection }))
  )
  const { afterOrganizations, enterOperationPanel } = useStore(
    useShallow(s => ({ afterOrganizations: s.afterOrganizations, enterOperationPanel: s.enterOperationPanel }))
  )
  const dispatch = useUICommandStore(s => s.dispatch)

  const [modal, setModal] = useState<'orgTransfer' | 'transferReason' | null>(null)
  const count = selectedRowIds.size

  if (count === 0) return null

  const rowIds   = [...selectedRowIds]
  const isSingle = count === 1
  const singleId = isSingle ? rowIds[0] : null

  const handleOrgSelect = (orgId: string) => {
    const org = afterOrganizations.find(o => o.id === orgId)
    appService.executeOperation(
      new MoveRowsToOrgOperation(rowIds, orgId, `${count}名 → ${org?.name ?? orgId}`)
    )
    clearSelection()
    setModal(null)
  }

  const handleSingleOp = (operationId: 'Promotion' | 'Demotion' | 'ManagerChange') => {
    if (!singleId) return
    // enterOperationPanel でパネルを開いてから、uiCommandStore で操作フォームへ直接遷移
    enterOperationPanel(singleId, 'summary')
    dispatch({ type: 'openOperation', rowId: singleId, operationId })
  }

  return (
    <>
      <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-600 text-white flex-shrink-0 flex-wrap">
        <span className="text-[10px] font-semibold whitespace-nowrap">
          {count}件選択中
        </span>
        <span className="text-blue-300 text-[10px]">|</span>

        {/* 組織異動（複数可） */}
        <button
          onClick={() => setModal('orgTransfer')}
          className="px-2 py-0.5 rounded text-[10px] font-medium bg-white text-blue-700 hover:bg-blue-50 whitespace-nowrap"
        >
          🏢 組織異動
        </button>

        {/* 異動事由（複数可） */}
        <button
          onClick={() => setModal('transferReason')}
          className="px-2 py-0.5 rounded text-[10px] font-medium bg-white text-blue-700 hover:bg-blue-50 whitespace-nowrap"
        >
          📋 異動事由
        </button>

        {/* 上司変更（1件のみ） */}
        <button
          disabled={!isSingle}
          onClick={() => handleSingleOp('ManagerChange')}
          title={isSingle ? undefined : '1件のみ選択してください'}
          className="px-2 py-0.5 rounded text-[10px] font-medium bg-white text-blue-700 hover:bg-blue-50 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
        >
          👤 上司変更
        </button>

        {/* 昇格（1件のみ） */}
        <button
          disabled={!isSingle}
          onClick={() => handleSingleOp('Promotion')}
          title={isSingle ? undefined : '1件のみ選択してください'}
          className="px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 hover:bg-green-200 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ↑ 昇格
        </button>

        {/* 降格（1件のみ） */}
        <button
          disabled={!isSingle}
          onClick={() => handleSingleOp('Demotion')}
          title={isSingle ? undefined : '1件のみ選択してください'}
          className="px-2 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ↓ 降格
        </button>

        <span className="text-blue-300 text-[10px]">|</span>
        <button
          onClick={clearSelection}
          className="text-[10px] text-blue-200 hover:text-white whitespace-nowrap"
        >
          選択解除
        </button>
      </div>

      {modal === 'orgTransfer' && (
        <OrgPickerModal
          open
          title={`組織異動（${count}名）`}
          confirmLabel="異動する"
          onClose={() => setModal(null)}
          onSelect={handleOrgSelect}
        />
      )}

      {modal === 'transferReason' && (
        <BulkFieldEditModal
          field="transferReason"
          rowIds={rowIds}
          onClose={() => { setModal(null); clearSelection() }}
        />
      )}
    </>
  )
}
