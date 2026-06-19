// 人操作 — 休職・復職・移籍・変更なし
import type { EditOperation } from './types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { FIELD_METADATA } from '../../allocationRow'
import { TR } from '../../transferReasonLabels'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}


// ── 休職 ─────────────────────────────────────────────────────────────────────

export const leaveOfAbsenceDef: EditOperation = {
  id:         'LeaveOfAbsence',
  label:      '休職',
  group:      'person',
  badgeColor: 'bg-gray-100 text-gray-600',

  description: '4/1付で休職する場合は個別対応します。3/31以前の休職については通常の申請を行った上で、必要な異動をしてください。',

  availableFor: (row) => !!row.userId && !row.leaveOfAbsenceSign,

  inputs: [
    { field: 'transferReason',     required: true,  readOnly: true },
    { field: 'leaveOfAbsenceSign', required: true,  readOnly: true, inputType: 'checkbox', label: '休職フラグ' },
    { field: 'memo',               required: false },
  ],

  deriveInitial: (row) => ({
    transferReason:     TR.LEAVE_AND_RETURN,
    leaveOfAbsenceSign: '1',
    memo:               row.memo as string | undefined,
  }),

  validate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId) return fail('人が配属されていない行に休職を設定できません')
    if (row.leaveOfAbsenceSign) return fail('すでに休職中です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? {
              ...r,
              leaveOfAbsenceSign: values.leaveOfAbsenceSign as string,
              transferReason:     values.transferReason as string,
              ...(values.memo !== undefined ? { memo: values.memo } : {}),
            }
          : r
      ),
      label: `休職: ${personName(row)}`,
    }
  },
}

// ── 休職取消 ──────────────────────────────────────────────────────────────────

export const leaveOfAbsenceCancelDef: EditOperation = {
  id:         'LeaveOfAbsenceCancel',
  label:      '休職取消',
  group:      'person',
  badgeColor: 'bg-gray-100 text-gray-600',

  description: '4/1付休職を取り消します。4/1以前に休職を行う場合は通常の申請をした上で、4/1時点の異動情報（例：組織変更（組改）など）が必要でしたら入力してください。',

  // セッション内で休職を設定した行（prev=空、after='1'）にのみ表示
  availableFor: (row) => !!row.leaveOfAbsenceSign && !row.prevLeaveOfAbsenceSign,

  inputs: [
    { field: 'transferReason',     required: false, readOnly: true },
    { field: 'leaveOfAbsenceSign', required: false, readOnly: true, inputType: 'checkbox', label: '休職フラグ' },
    { field: 'memo',               required: false },
  ],

  deriveInitial: (row) => ({
    transferReason:     undefined,
    leaveOfAbsenceSign: '',
    memo:               row.memo as string | undefined,
  }),

  validate(ctx, rowId, _values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },

  apply(ctx, rowId, values) {
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? {
              ...r,
              leaveOfAbsenceSign: undefined,
              transferReason:     undefined,
              memo:               values.memo as string | undefined,
            }
          : r
      ),
      label: '休職取消',
    }
  },
}

// ── 復職 ─────────────────────────────────────────────────────────────────────

export const returnFromLeaveDef: EditOperation = {
  id:         'ReturnFromLeave',
  label:      '復職',
  group:      'person',
  badgeColor: 'bg-gray-100 text-gray-600',

  description: '4/1付で復職します。4/1以前に復職を行う場合は通常の申請をした上で、4/1時点の異動情報（例：組織変更（組改）など）が必要でしたら入力してください。',

  availableFor: (row) => !!row.leaveOfAbsenceSign,

  inputs: [
    { field: 'transferReason',     required: false, readOnly: true },
    { field: 'leaveOfAbsenceSign', required: false, readOnly: true, inputType: 'checkbox', label: '休職フラグ（クリア）' },
    { field: 'memo',               required: false },
  ],

  deriveInitial: (row) => ({
    transferReason:     undefined,
    leaveOfAbsenceSign: '',
    memo:               row.memo as string | undefined,
  }),

  validate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)                    return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.leaveOfAbsenceSign) return fail('休職中ではないため復職できません')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? {
              ...r,
              leaveOfAbsenceSign: undefined,
              transferReason:     values.transferReason as string | undefined,
              ...(values.memo !== undefined ? { memo: values.memo } : {}),
            }
          : r
      ),
      label: `復職: ${personName(row)}`,
    }
  },
}

// ── 移籍 ─────────────────────────────────────────────────────────────────────

export const employmentTransferDef: EditOperation = {
  id:         'EmploymentTransfer',
  label:      '移籍',
  group:      'person',
  badgeColor: 'bg-rose-100 text-rose-700',

  availableFor: () => true,

  inputs: [
    { field: 'transferReason',       required: true,  readOnly: true },
    { field: 'lastName',             required: false },
    { field: 'firstName',            required: false },
    { field: 'employeeNumber',       required: false },
    { field: 'departmentCode',       required: false },
    { field: 'employmentType',       required: false },
    { field: 'band',                 required: false },
    { field: 'payGrade',             required: false },
    { field: 'officialPositionCode', required: false },
    { field: 'localJobTitle',        required: false },
    { field: 'memo',                 required: false },
  ],

  deriveInitial: (row) => ({
    transferReason:       TR.TRANSFER,
    lastName:             row.lastName             as string | undefined,
    firstName:            row.firstName            as string | undefined,
    employeeNumber:       row.employeeNumber       as string | undefined,
    departmentCode:       row.departmentCode       as string | undefined,
    employmentType:       row.employmentType       as string | undefined,
    band:                 row.band                 as string | undefined,
    payGrade:             row.payGrade             as string | undefined,
    officialPositionCode: row.officialPositionCode as string | undefined,
    localJobTitle:        row.localJobTitle        as string | undefined,
    memo:                 row.memo                 as string | undefined,
  }),

  validate(ctx, rowId, values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.transferReason) return fail('異動事由は必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? {
              ...r,
              transferReason:       values.transferReason,
              lastName:             values.lastName             as string | undefined,
              firstName:            values.firstName            as string | undefined,
              employeeNumber:       values.employeeNumber       as string | undefined,
              departmentCode:       values.departmentCode       as string | undefined,
              employmentType:       values.employmentType       as string | undefined,
              band:                 values.band                 as string | undefined,
              payGrade:             values.payGrade             as string | undefined,
              officialPositionCode: values.officialPositionCode as string | undefined,
              localJobTitle:        values.localJobTitle        as string | undefined,
              memo:                 values.memo                 as string | undefined,
            }
          : r
      ),
      label: `移籍: ${personName(row)}`,
    }
  },
}

// ── 変更なし ──────────────────────────────────────────────────────────────────

export const noChangeDef: EditOperation = {
  id:         'NoChange',
  label:      '変更なし',
  group:      'person',
  badgeColor: 'bg-neutral-100 text-neutral-500',

  description: '変更がない場合に選択してください。after 項目はすべて空白になります。',

  availableFor: () => true,

  inputs: [
    { field: 'transferReason', required: true,  readOnly: true },
    { field: 'memo',           required: false },
  ],

  deriveInitial: (row) => ({
    transferReason: TR.NO_CHANGE,
    memo:           row.memo as string | undefined,
  }),

  validate(ctx, rowId, values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.transferReason) return fail('変更なし事由は必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!

    // after フィールドを全て空白にクリア（変更なし = Excel 上も after 欄は空欄）
    const cleared: Partial<AllocationRow> = {}
    for (const { after } of FIELD_METADATA) {
      ;(cleared as Record<string, unknown>)[after] = undefined
    }

    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? {
              ...r,
              ...cleared,
              transferReason:    values.transferReason,
              memo:              values.memo,
              promotionSign:     undefined,
              demotionReason:    undefined,
              payGradeChangeSign: undefined,
            }
          : r
      ),
      label: `変更なし: ${personName(row)}`,
    }
  },
}

export const DEFS: EditOperation[] = [
  leaveOfAbsenceDef, leaveOfAbsenceCancelDef, returnFromLeaveDef,
  employmentTransferDef,
  noChangeDef,
]
