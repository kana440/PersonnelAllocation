// 上司変更・ポジション追加
import type { EditOperation } from './types'
import { AVAILABLE, unavailable } from './types'
import { ok, fail }           from '../types'
import type { AllocationRow } from '../../allocationRow'
import { nextRowId }          from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'
import { getDescendantPositionCodes, isNewRow } from '../helpers'
import { deriveManagerName }  from '../../rules/derive'
import { TR } from '../../transferReasonLabels'

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

  createCommand(rowId, values) {
    return {
      kind: 'ManagerChange',
      validate(ctx) {
        if (!ctx.allocationList.find(r => r.rowId === rowId))
          return fail(`行が見つかりません (rowId: ${rowId})`)
        return ok()
      },
      apply(ctx) {
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
  },
}

// ── 空席ポジション追加（組織パネルボタンから起動）────────────────────────────

export const addEmptyPositionDef: EditOperation = {
  id:         'AddEmptyPosition',
  label:      'ポジション追加',
  group:      'position',
  badge:      'neutral',

  suppressSideEffectWarning: true,

  operationRole: {
    kind:                'lock',
    isActive:            (row) => isNewRow(row) && (row.transferReason as string | undefined) === TR.NEW_POSITION,
    isActiveThisSession: (row) => isNewRow(row) && (row.transferReason as string | undefined) === TR.NEW_POSITION,
  },

  availableFor(row) {
    if (!isNewRow(row)) return unavailable('新規追加された行のみ対象です')
    if ((row.transferReason as string | undefined) !== TR.NEW_POSITION) return unavailable('ポジション追加として作成された行のみ対象です')
    return AVAILABLE
  },

  inputs: [
    { field: 'positionCode',   required: false, label: 'ポジション番号（自動採番・変更可）' },
    { field: 'transferReason', required: false },
    { field: 'memo',           required: false },
  ],

  // row.departmentCode に追加先組織コードが入ってくる（NewRowOperationModal の syntheticRow）
  onOpen: (row, ctx) => ({
    positionCode:   (row.positionCode as string | undefined) ?? `_pos_${nextRowId(ctx.allocationList)}`,
    departmentCode: row.departmentCode,
    transferReason: (row.transferReason as string | undefined) ?? TR.NEW_POSITION,
    memo:           row.memo as string | undefined,
  }),

  createCommand(_rowId, values) {
    return {
      kind: 'AddEmptyPosition',
      validate: () => ok(),
      apply(ctx) {
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
  },
}

// ── ポジション追加取消（セッション内追加分） ──────────────────────────────────

export const addEmptyPositionCancelDef: EditOperation = {
  id:    'AddEmptyPositionCancel',
  label: 'ポジション追加取消',
  group: 'position',
  badge: 'negative',
  description: 'このセッションで追加した空席ポジションを削除します。',
  suppressSideEffectWarning: true,

  operationRole: { kind: 'lockCancel', of: 'AddEmptyPosition' },

  availableFor(row) {
    if (!isNewRow(row)) return unavailable('新規追加された行のみ対象です')
    if ((row.transferReason as string | undefined) !== TR.NEW_POSITION) return unavailable('ポジション追加として作成された行のみ対象です')
    return AVAILABLE
  },

  inputs: [
    { field: 'positionCode',   required: false, readOnly: true, label: 'ポジション番号' },
    { field: 'departmentCode', required: false, readOnly: true, label: '組織コード' },
    { field: 'transferReason', required: false, readOnly: true },
    { field: 'memo',           required: false, readOnly: true },
  ],

  onOpen: (row) => ({
    positionCode:   row.positionCode,
    departmentCode: row.departmentCode,
    transferReason: row.transferReason,
    memo:           row.memo,
  }),

  createCommand(rowId) {
    return {
      kind: 'AddEmptyPositionCancel',
      validate(ctx) {
        if (!ctx.allocationList.find(r => r.rowId === rowId)) return fail(`行が見つかりません (rowId: ${rowId})`)
        return ok()
      },
      apply(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)!
        const deptCode = (row.departmentCode as string | undefined) ?? ''
        return {
          updatedList: ctx.allocationList.filter(r => r.rowId !== rowId),
          label: `ポジション追加取消: ${deptCode}`,
        }
      },
    }
  },
}

export const DEFS: EditOperation[] = [managerChangeDef, addEmptyPositionDef, addEmptyPositionCancelDef]
