// 上司変更・ポジション追加
import type { EditOperation } from './types'
import { AVAILABLE, unavailable } from './types'
import { ok, fail }           from '../types'
import type { AllocationRow } from '../../allocationRow'
import { nextRowId }          from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'
import { getDescendantPositionCodes } from '../helpers'
import { deriveManagerName }  from '../../rules/derive'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── 上司変更 ─────────────────────────────────────────────────────────────────

export const managerChangeDef: EditOperation = {
  id:         'ManagerChange',
  label:      '上司変更',
  group:      'position',
  badge:      'transfer',

  availableFor: (row) =>
    row.positionCode ? AVAILABLE : unavailable('ポジションコードが設定されていない行には設定できません'),

  inputs: [
    { field: 'transferReason', required: false },
    {
      field:          'managerPositionCode',
      required:       true,
      picker:         'managerPosition',
      positionFilter: (row, ctx) => {
        const self = row.positionCode as string | undefined
        if (!self) return () => true
        const descendants = getDescendantPositionCodes(self, ctx.allocationList)
        return (candidate) =>
          !!candidate.positionCode &&
          candidate.positionCode !== self &&
          !descendants.has(candidate.positionCode as string)
      },
    },
    { field: 'memo', required: false },
  ],

  onOpen: (row, ctx) => {
    const mpc = row.managerPositionCode as string | undefined
    return {
      transferReason:      row.transferReason as string | undefined,
      managerPositionCode: mpc,
      managerName:         deriveManagerName(mpc, ctx.allocationList),
      memo:                row.memo           as string | undefined,
    }
  },

  onValidate(ctx, rowId, _values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? { ...r, managerPositionCode: values.managerPositionCode, managerName: values.managerName, memo: values.memo as string | undefined }
          : r
      ),
      label: `上司変更: ${personName(row)}`,
    }
  },
}

// ── 空席ポジション追加（組織パネルボタンから起動）────────────────────────────

export const addEmptyPositionDef: EditOperation = {
  id:         'AddEmptyPosition',
  label:      'ポジション追加',
  group:      'position',
  badge:      'neutral',

  suppressSideEffectWarning: true,

  // 組織パネルボタンからのみ起動。行メニューには表示しない
  availableFor: () => unavailable('組織パネルボタンからのみ起動できます'),

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

export const DEFS: EditOperation[] = [managerChangeDef, addEmptyPositionDef]
