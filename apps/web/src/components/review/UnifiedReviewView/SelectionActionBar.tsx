import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRowSelectionStore }     from '../../../store/rowSelectionStore'
import { useStore }                 from '../../../store/useStore'
import { useUICommandStore }        from '../../../store/uiCommandStore'
import { appService }               from '../../../application/HRApplicationService'
import { MoveRowsToOrgOperation }   from '@personnel/domain/commands/handlers/moveRowsToOrg'
import { ResetToInitialOperation, hasResetBaseline } from '@personnel/domain/commands/handlers/resetToInitial'
import type { AllocationRow }       from '@personnel/domain/allocationRow'
import { SelectMoveModal }          from '../../common/SelectMoveModal'
import { BulkManagerPositionModal } from '../../common/BulkManagerPositionModal'
import { BulkFieldEditModal }       from '../components/BulkFieldEditModal'
import { ConfirmDialog }            from '../../common/ConfirmDialog'

/**
 * Review テーブルで行が1件以上選択されているときに表示する操作バー。
 *
 * - 組織異動 / 異動事由 / 初期に戻す — 複数行可
 * - 上司変更 — 複数行可（キャンバスの選択モードと同じ SelectMoveModal / BulkManagerPositionModal を使う）
 * - 昇格 / 降格 — 1件のみ（uiCommandStore 経由で PersonOperationPanel の操作フォームへ直接遷移）
 */
export function SelectionActionBar() {
  const { selectedRowIds, clearSelection } = useRowSelectionStore(
    useShallow(s => ({ selectedRowIds: s.selectedRowIds, clearSelection: s.clearSelection }))
  )
  const { afterOrganizations, allocationList, enterOperationPanel } = useStore(
    useShallow(s => ({ afterOrganizations: s.afterOrganizations, allocationList: s.allocationList, enterOperationPanel: s.enterOperationPanel }))
  )
  const dispatch = useUICommandStore(s => s.dispatch)

  const [modal, setModal] = useState<'orgTransfer' | 'transferReason' | 'manager' | null>(null)
  const [resetConfirm, setResetConfirm] = useState<{ message: string; rowIds: number[] } | null>(null)
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

  // 上司変更: 1件なら個別画面の操作フォームへ、複数件ならキャンバスと同じ一括ピッカーを開く
  const handleManagerChange = () => {
    if (isSingle) { handleSingleOp('ManagerChange'); return }
    setModal('manager')
  }

  const handleResetToInitial = () => {
    const rows     = rowIds.map(id => allocationList.find(r => r.rowId === id)).filter((r): r is NonNullable<typeof r> => !!r)
    const eligible = rows.filter(hasResetBaseline)
    const skipped  = rows.length - eligible.length
    if (eligible.length === 0) return
    setResetConfirm({
      message:
        `選択した${eligible.length}件を初期状態（インポート時点）に戻します。\n異動事由・メモもクリアされます。` +
        (skipped > 0 ? `\n（${skipped}件は新規追加行のため対象外です）` : '') +
        `\nよろしいですか？`,
      rowIds: eligible.map(r => r.rowId),
    })
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

        {/* 上司変更（複数可） */}
        <button
          onClick={handleManagerChange}
          className="px-2 py-0.5 rounded text-[10px] font-medium bg-white text-blue-700 hover:bg-blue-50 whitespace-nowrap"
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

        {/* 初期に戻す（複数可） */}
        <button
          onClick={handleResetToInitial}
          className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 hover:bg-red-200 whitespace-nowrap"
        >
          ↺ 初期に戻す
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
        <SelectMoveModal
          selectedCount={count}
          allOrgs={afterOrganizations}
          onConfirm={handleOrgSelect}
          onCancel={() => setModal(null)}
        />
      )}

      {modal === 'transferReason' && (
        <BulkFieldEditModal
          field="transferReason"
          rowIds={rowIds}
          onClose={() => { setModal(null); clearSelection() }}
        />
      )}

      {modal === 'manager' && (
        <BulkManagerPositionModal
          rows={rowIds.map(id => allocationList.find(r => r.rowId === id)).filter((r): r is AllocationRow => !!r)}
          allocationList={allocationList}
          afterOrganizations={afterOrganizations}
          onDone={() => { setModal(null); clearSelection() }}
          onCancel={() => setModal(null)}
        />
      )}

      {resetConfirm && (
        <ConfirmDialog
          message={resetConfirm.message}
          confirmLabel="初期状態に戻す"
          onConfirm={() => {
            appService.executeBatch('初期状態に戻す', resetConfirm.rowIds.map(id => new ResetToInitialOperation(id)))
            clearSelection()
          }}
          onCancel={() => setResetConfirm(null)}
        />
      )}
    </>
  )
}
