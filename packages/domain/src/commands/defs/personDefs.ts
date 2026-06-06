// 人操作 — 休職・復職・移籍・変更なし
import type { OperationDef } from './types'
import { LeaveOfAbsenceOperation, ReturnFromLeaveOperation, NoChangeOperation } from '../handlers/statusOps'
import { EmploymentTransferOutOperation, EmploymentTransferInOperation } from '../handlers/transferOps'

// ── 休職 ─────────────────────────────────────────────────────────────────────

export const leaveOfAbsenceDef: OperationDef = {
  id:         'LeaveOfAbsence',
  label:      '休職',
  group:      'person',
  badgeColor: 'bg-gray-100 text-gray-600',

  availableFor: (row) => !!row.userId && !row.leaveOfAbsenceSign,

  inputs: [
    { field: 'leaveOfAbsenceSign', required: true,  label: '休職フラグ' },
    { field: 'memo',      required: false, label: '休職種別メモ' },
  ],

  deriveInitial: () => ({}),

  createCommand: (rowId, input) =>
    new LeaveOfAbsenceOperation(
      rowId,
      input.leaveOfAbsenceSign as '1',
      input.memo      as string | undefined,
    ),
}

// ── 復職 ─────────────────────────────────────────────────────────────────────

export const returnFromLeaveDef: OperationDef = {
  id:         'ReturnFromLeave',
  label:      '復職',
  group:      'person',
  badgeColor: 'bg-gray-100 text-gray-600',

  availableFor: (row) => !!row.leaveOfAbsenceSign,

  inputs: [],

  deriveInitial: () => ({}),

  createCommand: (rowId) => new ReturnFromLeaveOperation(rowId),
}

// ── 移籍（出る）──────────────────────────────────────────────────────────────

export const employmentTransferOutDef: OperationDef = {
  id:         'EmploymentTransferOut',
  label:      '移籍（出る）',
  group:      'person',
  badgeColor: 'bg-rose-100 text-rose-700',

  availableFor: (row) => !!row.userId,

  inputs: [
    { field: 'transferReason', required: true, label: '移籍事由' },
  ],

  deriveInitial: () => ({}),

  createCommand: (rowId, input) =>
    new EmploymentTransferOutOperation(rowId, input.transferReason as string),
}

// ── 移籍（入る）──────────────────────────────────────────────────────────────
// 注意: この操作は rowId を使わず新規行を作成する。
// createCommand の rowId 引数は無視され、nextRowId が内部で計算される。

export const employmentTransferInDef: OperationDef = {
  id:         'EmploymentTransferIn',
  label:      '移籍（入る）',
  group:      'person',
  badgeColor: 'bg-rose-100 text-rose-700',

  // 未アサイン行（userId なし）または新規行追加モードで使用
  availableFor: (row) => !row.prevDepartmentCode,

  inputs: [
    { field: 'lastName',        required: false },
    { field: 'firstName',       required: false },
    { field: 'employeeNumber',  required: false },
    { field: 'departmentCode',  required: true,  label: '移籍先組織コード' },
    { field: 'employmentType',  required: true,  label: '雇用タイプ' },
    { field: 'band',            required: false },
    { field: 'payGrade',        required: false },
    { field: 'officialPositionCode', required: false },
    { field: 'localJobTitle',   required: false },
    { field: 'transferReason',  required: true,  label: '移籍事由' },
  ],

  deriveInitial: (row) => ({
    departmentCode: row.departmentCode as string | undefined,
    transferReason: row.transferReason as string | undefined,
  }),

  createCommand: (_rowId, input) =>
    new EmploymentTransferInOperation({
      lastName:           input.lastName            as string | undefined,
      firstName:          input.firstName           as string | undefined,
      employeeNumber:     input.employeeNumber      as string | undefined,
      departmentCode:     input.departmentCode      as string | undefined,
      employmentType:     input.employmentType      as string | undefined,
      band:               input.band                as string | undefined,
      payGrade:           input.payGrade            as string | undefined,
      officialPositionCode: input.officialPositionCode as string | undefined,
      localJobTitle:      input.localJobTitle       as string | undefined,
      transferReason:     input.transferReason      as string | undefined,
    }),
}

// ── 変更なし ──────────────────────────────────────────────────────────────────

export const noChangeDef: OperationDef = {
  id:         'NoChange',
  label:      '変更なし',
  group:      'person',
  badgeColor: 'bg-neutral-100 text-neutral-500',

  availableFor: () => true,

  inputs: [
    { field: 'transferReason', required: true, label: '変更なし事由' },
  ],

  deriveInitial: () => ({}),

  createCommand: (rowId, input) =>
    new NoChangeOperation(rowId, input.transferReason as string),
}
