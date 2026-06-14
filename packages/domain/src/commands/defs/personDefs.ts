// 人操作 — 休職・復職・移籍・変更なし
import type { OperationDef } from './types'
import {
  LeaveOfAbsenceOperation, ReturnFromLeaveOperation, NoChangeOperation,
  EmploymentTransferOutOperation, EmploymentTransferInOperation,
} from '../handlers/personOps'
import { DirectEditOperation } from '../handlers/directEdit'

// ── 休職 ─────────────────────────────────────────────────────────────────────

export const leaveOfAbsenceDef: OperationDef = {
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
    transferReason:     '【個別対応】4/1付休職・復職',
    leaveOfAbsenceSign: '1',
    memo:               row.memo as string | undefined,
  }),

  createCommand: (rowId, input) =>
    new LeaveOfAbsenceOperation(
      rowId,
      input.transferReason as string,
      input.memo           as string | undefined,
    ),
}

// ── 休職取消 ──────────────────────────────────────────────────────────────────

export const leaveOfAbsenceCancelDef: OperationDef = {
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

  createCommand: (rowId, input) =>
    new DirectEditOperation(
      rowId,
      { leaveOfAbsenceSign: undefined, transferReason: undefined, memo: input.memo as string | undefined },
      '休職取消',
    ),
}

// ── 復職 ─────────────────────────────────────────────────────────────────────

export const returnFromLeaveDef: OperationDef = {
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

  createCommand: (rowId, input) =>
    new ReturnFromLeaveOperation(
      rowId,
      input.transferReason as string | undefined,
      input.memo           as string | undefined,
    ),
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

  description: '変更がない場合はこちらを選らんでください。',

  availableFor: () => true,

  inputs: [
    { field: 'transferReason', required: true, label: '異動事由' },
    { field: 'memo', required: true, label: 'メモ' },
  ],

  deriveInitial: (row) => ({
    transferReason: '【対応なし】変更なし',
    memo: row.memo as string | undefined,
  }),

  createCommand: (rowId, input) =>
    new NoChangeOperation(rowId, input.transferReason as string),
}

export const DEFS: OperationDef[] = [
  leaveOfAbsenceDef, leaveOfAbsenceCancelDef, returnFromLeaveDef,
  employmentTransferOutDef, employmentTransferInDef,
  noChangeDef,
]
