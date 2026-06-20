// 空席ポジション追加（組織パネルボタンから起動）
import type { EditOperation } from './types'
import { ok }                  from '../types'
import type { AllocationRow }  from '../../allocationRow'
import { nextRowId }           from '../../allocationRow'
import { deriveOrgSubFields }  from '../orgHelpers'

export const addEmptyPositionDef: EditOperation = {
  id:         'AddEmptyPosition',
  label:      'ポジション追加',
  group:      'position',
  badge: 'neutral',

  suppressSideEffectWarning: true,

  // 組織パネルボタンからのみ起動。行メニューには表示しない
  availableFor: () => false,

  inputs: [
    { field: 'positionCode',   required: false, label: 'ポジション番号（自動採番・変更可）' },
    { field: 'transferReason', required: false },
    { field: 'memo',           required: false },
  ],

  // row.departmentCode に追加先組織コードが入ってくる（NewRowOperationModal の syntheticRow）
  onOpen: (row, ctx) => ({
    positionCode:   `_pos_${nextRowId(ctx.allocationList)}`,
    departmentCode: row.departmentCode,
    transferReason: undefined,
    memo:           undefined,
  }),

  onValidate(_ctx, _rowId, _values) {
    return ok()
  },

  onSubmit(ctx, _rowId, values) {
    const newRowId = nextRowId(ctx.allocationList)
    const deptCode = (values.departmentCode as string | undefined) ?? ''
    const posCode  = ((values.positionCode as string | undefined) ?? '').trim() || `_pos_${newRowId}`
    const orgSub   = deptCode ? deriveOrgSubFields(deptCode, ctx.masters) : {}

    const newRow: AllocationRow = {
      ...orgSub,
      rowId:                newRowId,
      departmentCode:       deptCode,
      positionCode:         posCode,
      transferReason:       values.transferReason as string | undefined,
      memo:                 values.memo           as string | undefined,
      trainingPositionFlag: '0',
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label:       `ポジション追加: ${deptCode}`,
    }
  },
}

export const DEFS: EditOperation[] = [addEmptyPositionDef]
