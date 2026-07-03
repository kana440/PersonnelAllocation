// 人操作 — 休職・復職・移籍・変更なし・組織割当リセット
import type { EditOperation } from './types'
import { AVAILABLE, unavailable } from './types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { FIELD_METADATA } from '../../allocationRow'
import { TR } from '../../transferReasonLabels'
import { preserve } from './afterConstraintHelpers'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}


// ── 休職 ─────────────────────────────────────────────────────────────────────

export const leaveOfAbsenceDef: EditOperation = {
  id:          'LeaveOfAbsence',
  label:       '4/1付休職',
  group:       'person',
  badge:       'neutral',

  description: '4/1付で休職する場合は個別対応します。3/31以前の休職については通常の申請を行った上で、必要な異動をしてください。',

  operationRole: {
    kind:        'softLock',
    ownedFields: ['transferReason', 'leaveOfAbsenceSign'],
    isActive:            (row) => !!row.leaveOfAbsenceSign,
    isActiveThisSession: (row) => !!row.leaveOfAbsenceSign && !row.prevLeaveOfAbsenceSign,
  },

  availableFor(row) {
    if (!row.userId)                return unavailable('担当者が配属されていない行には設定できません')
    if (row.prevLeaveOfAbsenceSign) return unavailable('インポート前から休職中のため設定できません（復職操作を使用してください）')
    return AVAILABLE
  },

  inputs: [
    { field: 'transferReason',     required: true,  readOnly: true, options: [TR.LEAVE_AND_RETURN] },
    { field: 'leaveOfAbsenceSign', required: true,  readOnly: true, inputType: 'checkbox', label: '休職フラグ' },
    { field: 'memo',               required: false },
  ],

  onOpen: (row) => ({
    transferReason:     TR.LEAVE_AND_RETURN,
    leaveOfAbsenceSign: '1',
    memo:               row.memo as string | undefined,
  }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId) return fail('人が配属されていない行に休職を設定できません')
    if (row.leaveOfAbsenceSign) return fail('すでに休職中です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
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
  id:          'LeaveOfAbsenceCancel',
  label:       '休職取消',
  group:       'person',
  badge:       'neutral',

  description: '4/1付休職を取り消します。4/1以前に休職を行う場合は通常の申請をした上で、4/1時点の異動情報（例：組織変更（組改）など）が必要でしたら入力してください。',

  availableFor(row) {
    if (!row.leaveOfAbsenceSign)     return unavailable('休職中ではないため取消できません')
    if (row.prevLeaveOfAbsenceSign)  return unavailable('インポート前からの休職は取消できません（復職操作を使用してください）')
    return AVAILABLE
  },

  inputs: [
    { field: 'transferReason',     required: false, readOnly: true },
    { field: 'leaveOfAbsenceSign', required: false, readOnly: true, inputType: 'checkbox', label: '休職フラグ' },
    { field: 'memo',               required: false },
  ],

  onOpen: (row) => ({
    transferReason:     undefined,
    leaveOfAbsenceSign: '',
    memo:               row.memo as string | undefined,
  }),

  onValidate(ctx, rowId, _values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },

  onSubmit(ctx, rowId, values) {
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
  id:          'ReturnFromLeave',
  label:       '復職',
  group:       'person',
  badge:       'positive',

  description: '4/1付で復職します。4/1以前に復職を行う場合は通常の申請をした上で、4/1時点の異動情報（例：組織変更（組改）など）が必要でしたら入力してください。',

  operationRole: {
    kind:        'softLock',
    ownedFields: ['transferReason', 'leaveOfAbsenceSign'],
    // 元から休職中（prev あり）でセッション内に解除した状態
    isActive:            (row) => !row.leaveOfAbsenceSign && !!row.prevLeaveOfAbsenceSign,
    isActiveThisSession: (row) => !row.leaveOfAbsenceSign && !!row.prevLeaveOfAbsenceSign,
  },

  availableFor: (row) =>
    row.leaveOfAbsenceSign ? AVAILABLE : unavailable('現在休職中でないため復職できません'),

  inputs: [
    { field: 'transferReason',     required: false, readOnly: true, options: [] },
    { field: 'leaveOfAbsenceSign', required: false, readOnly: true, inputType: 'checkbox', label: '休職フラグ（クリア）' },
    { field: 'memo',               required: false },
  ],

  onOpen: (row) => ({
    transferReason:     undefined,
    leaveOfAbsenceSign: '',
    memo:               row.memo as string | undefined,
  }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)                    return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.leaveOfAbsenceSign) return fail('休職中ではないため復職できません')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
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

// ── 復職取消 ──────────────────────────────────────────────────────────────────

export const returnFromLeaveCancelDef: EditOperation = {
  id:          'ReturnFromLeaveCancel',
  label:       '復職取消',
  group:       'person',
  badge:       'neutral',

  description: '4/1付復職を取り消します。',

  availableFor(row) {
    if (row.leaveOfAbsenceSign)       return unavailable('まだ休職中のため復職取消できません')
    if (!row.prevLeaveOfAbsenceSign)  return unavailable('インポート前から非休職のため復職取消できません')
    return AVAILABLE
  },

  inputs: [
    { field: 'leaveOfAbsenceSign', required: false, readOnly: true, inputType: 'checkbox', label: '休職フラグ（復元）' },
    { field: 'transferReason',     required: false, readOnly: true },
    { field: 'memo',               required: false },
  ],

  onOpen: (row) => ({
    leaveOfAbsenceSign: '1',
    transferReason:     undefined,
    memo:               row.memo as string | undefined,
  }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)                         return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.leaveOfAbsenceSign)       return fail('現在休職中のため復職取消できません')
    if (!row.prevLeaveOfAbsenceSign)  return fail('元から休職中ではないため復職取消できません')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? {
              ...r,
              leaveOfAbsenceSign: row.prevLeaveOfAbsenceSign,  // before 状態に戻す
              transferReason:     undefined,
              memo:               values.memo as string | undefined,
            }
          : r
      ),
      label: `復職取消: ${personName(row)}`,
    }
  },
}

// ── 退職 ─────────────────────────────────────────────────────────────────────

export const resignationDef: EditOperation = {
  id:          'Resignation',
  label:       '4/1付退職',
  group:       'person',
  badge:       'negative',

  description: '4/1付で退職（または解任済み）として登録します。設定後は他の操作がロックされます。',

  operationRole: {
    kind:                'lock',
    isActive:            (row) => row.transferReason === TR.TERMINATION,
    isActiveThisSession: (row) => row.transferReason === TR.TERMINATION,
  },

  availableFor: () => AVAILABLE,

  inputs: [
    { field: 'transferReason', required: true,  readOnly: true, options: [TR.TERMINATION] },
    { field: 'memo',           required: false },
  ],

  onOpen: (row) => ({
    transferReason: TR.TERMINATION,
    memo:           row.memo as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.transferReason) return fail('異動事由は必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? { ...r, transferReason: values.transferReason, memo: values.memo as string | undefined }
          : r
      ),
      label: `退職: ${personName(row)}`,
    }
  },
}

// ── 退職取消 ─────────────────────────────────────────────────────────────────

export const resignationCancelDef: EditOperation = {
  id:          'ResignationCancel',
  label:       '退職取消',
  group:       'person',
  badge:       'neutral',

  description: '4/1付退職を取り消します。',

  operationRole: { kind: 'lockCancel', of: 'Resignation' },

  availableFor: () => AVAILABLE,

  inputs: [
    { field: 'transferReason', required: false, readOnly: true },
    { field: 'memo',           required: false },
  ],

  onOpen: (row) => ({
    transferReason: undefined,
    memo:           row.memo as string | undefined,
  }),

  onValidate(ctx, rowId, _values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? { ...r, transferReason: undefined, memo: values.memo as string | undefined }
          : r
      ),
      label: '退職取消',
    }
  },
}

// ── 移籍 ─────────────────────────────────────────────────────────────────────

export const employmentTransferDef: EditOperation = {
  id:          'EmploymentTransfer',
  label:       '4/1移籍',
  group:       'person',
  badge:       'negative',

  description: '4/1付でグループ外または他社へ移籍する場合に設定します。移籍後の氏名・組織・バンドなど必要な情報を入力してください。',

  operationRole: {
    kind:                'lock',
    isActive:            (row) => row.transferReason === TR.TRANSFER,
    isActiveThisSession: (row) => row.transferReason === TR.TRANSFER,
  },

  availableFor: (row) =>
    row.transferReason !== TR.ORG_TRANSFER
      ? AVAILABLE
      : unavailable('組織移管（ORG_TRANSFER）が設定されている行には適用できません'),

  inputs: [
    { field: 'transferReason',       required: true,  readOnly: true, options: [TR.TRANSFER] },
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

  onOpen: (row) => ({
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

  onValidate(ctx, rowId, values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.transferReason) return fail('異動事由は必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
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

// ── 移籍取消 ──────────────────────────────────────────────────────────────────

export const employmentTransferCancelDef: EditOperation = {
  id:          'EmploymentTransferCancel',
  label:       '移籍取消',
  group:       'person',
  badge:       'neutral',

  description: '4/1付移籍を取り消します。',

  operationRole: { kind: 'lockCancel', of: 'EmploymentTransfer' },

  availableFor: () => AVAILABLE,

  inputs: [
    { field: 'transferReason', required: false, readOnly: true },
    { field: 'memo',           required: false },
  ],

  onOpen: (row) => ({
    transferReason: undefined,
    memo:           row.memo as string | undefined,
  }),

  onValidate(ctx, rowId, _values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? {
              ...r,
              transferReason: undefined,
              memo:           values.memo as string | undefined,
            }
          : r
      ),
      label: '移籍取消',
    }
  },
}

// ── 変更なし ──────────────────────────────────────────────────────────────────

export const noChangeDef: EditOperation = {
  id:          'NoChange',
  label:       '変更なし',
  group:       'person',
  badge:       'neutral',

  description: '変更がない場合に選択してください。after 項目は発令前の値が維持されます。セッション内で変更済みの項目がある場合は確認ダイアログが表示されます。',

  operationRole: {
    kind:                'lock',
    afterConstraint:     'preserve',
    isActive:            (row) => row.transferReason === TR.NO_CHANGE,
    isActiveThisSession: (row) => row.transferReason === TR.NO_CHANGE,
  },

  availableFor: () => AVAILABLE,

  inputs: [
    { field: 'transferReason', required: true,  readOnly: true },
    { field: 'memo',           required: false },
  ],

  onOpen: (row) => ({
    transferReason: TR.NO_CHANGE,
    memo:           row.memo as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.transferReason) return fail('変更なし事由は必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? { ...r, ...preserve(row), transferReason: values.transferReason, memo: values.memo }
          : r
      ),
      label: `変更なし: ${personName(row)}`,
    }
  },
}

// ── 変更なし取消 ──────────────────────────────────────────────────────────────

export const noChangeCancelDef: EditOperation = {
  id:          'NoChangeCancel',
  label:       '変更なし取消',
  group:       'person',
  badge:       'neutral',

  description: '「変更なし」を取り消します。after 項目は Excel インポート時の before 値に復元されます。',

  operationRole: { kind: 'lockCancel', of: 'NoChange' },

  availableFor: () => AVAILABLE,

  inputs: [
    { field: 'transferReason', required: false, readOnly: true },
    { field: 'memo',           required: false },
  ],

  onOpen: (row) => ({
    transferReason: undefined,
    memo:           row.memo as string | undefined,
  }),

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
          ? { ...r, ...preserve(row), transferReason: undefined, memo: values.memo as string | undefined }
          : r
      ),
      label: `変更なし取消: ${personName(row)}`,
    }
  },
}

// ── 組織割当リセット ─────────────────────────────────────────────────────────

export const resetToBeforeDef: EditOperation = {
  id:          'ResetToBefore',
  label:       '組織割当リセット',
  group:       'person',
  badge:       'negative',

  description: '⚠ 警告：全ての after 項目を before（インポート前）の値に戻します。未割当の旧組織から誤って割り当てた行を元に戻すときに使います。実行するとセッション内の変更がすべて失われ、組織「未割当」状態に戻ります。',

  availableFor: (row) =>
    row.userId ? AVAILABLE : unavailable('人物がアサインされていない行には使えません'),

  inputs: [
    { field: 'departmentCode', required: false, readOnly: true, label: '現在の組織（リセット後は旧組織コードに戻ります）' },
    { field: 'memo',           required: false },
  ],

  onOpen: (row) => ({
    departmentCode: row.departmentCode as string | undefined,
    memo:           row.memo           as string | undefined,
  }),

  onValidate(ctx, rowId, _values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },

  onSubmit(ctx, rowId, _values) {
    const row    = ctx.allocationList.find(r => r.rowId === rowId)!
    const reset: Partial<AllocationRow> = {}
    for (const { after, before } of FIELD_METADATA) {
      ;(reset as Record<string, unknown>)[after] = row[before as keyof AllocationRow]
    }
    return {
      updatedList: ctx.allocationList.map(r => r.rowId === rowId ? { ...r, ...reset } : r),
      label:       `組織割当リセット: ${personName(row)}`,
    }
  },
}

export const DEFS: EditOperation[] = [
  leaveOfAbsenceDef,         leaveOfAbsenceCancelDef,
  returnFromLeaveDef,        returnFromLeaveCancelDef,
  resignationDef,            resignationCancelDef,
  employmentTransferDef,     employmentTransferCancelDef,
  noChangeDef,               noChangeCancelDef,
  resetToBeforeDef,
]
