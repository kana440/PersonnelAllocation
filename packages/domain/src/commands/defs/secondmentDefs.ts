// 出向操作 — 本務出向/受入・兼務出向/受入・それぞれの解除（SF統合・非統合）
import type { OperationDef } from './types'
import {
  SecondmentOutOperation,
  SecondmentInOperation,
  ConcurrentSecondmentOutOperation,
  ConcurrentSecondmentInOperation,
  SecondmentOutReleaseOperation,
  SecondmentInReleaseOperation,
  ConcurrentSecondmentOutReleaseOperation,
  ConcurrentSecondmentInReleaseOperation,
} from '../handlers/secondmentOps'
import { isRegularEmployee, isSecondmentAcceptance, wasSecondedOut, wasSecondedIn, isMainAssignment, prevWasSecondmentIn, isSFIntegratedCompany } from '../helpers'

// ── 本務出向（SF統合先） ──────────────────────────────────────────────────────

export const secondmentOutSFDef: OperationDef = {
  id:         'SecondmentOutSF',
  label:      '本務出向（SF統合先）',
  group:      'person',
  badgeColor: 'bg-amber-100 text-amber-700',

  availableFor: (row, cl) =>
    isRegularEmployee(row, cl) && isMainAssignment(row) && !wasSecondedOut(row),

  inputs: [
    { field: 'secondmentToCompany', required: true,  label: '出向先会社（SF統合）' },
    { field: 'departmentCode',      required: true,  label: '出向先組織コード' },
    { field: 'employmentType',      required: true,  label: '雇用タイプ（出向）' },
    { field: 'transferReason',      required: true  },
  ],

  deriveInitial: () => ({}),
  // 出向者用組織の自動提案は UI 側で suggestSecondmentOrgCodes() を呼ぶこと
  // (deriveInitial は AllocationRow 型を返すため任意フィールドを渡せない)

  createCommand: (rowId, input) =>
    new SecondmentOutOperation(rowId, {
      secondmentToCompany: input.secondmentToCompany as string,
      departmentCode:      input.departmentCode      as string,
      employmentType:      input.employmentType      as string | undefined,
      transferReason:      input.transferReason      as string | undefined,
    }),
}

// ── 本務出向（SF非統合先） ────────────────────────────────────────────────────

export const secondmentOutNonSFDef: OperationDef = {
  id:         'SecondmentOutNonSF',
  label:      '本務出向（SF非統合先）',
  group:      'person',
  badgeColor: 'bg-amber-100 text-amber-700',

  availableFor: (row, cl) =>
    isRegularEmployee(row, cl) && isMainAssignment(row) && !wasSecondedOut(row),

  inputs: [
    { field: 'secondmentToCompany', required: true,  label: '出向先会社（SF非統合）' },
    { field: 'departmentCode',      required: false, label: '出向先組織コード（任意）' },
    { field: 'employmentType',      required: true,  label: '雇用タイプ（出向）' },
    { field: 'transferReason',      required: true  },
  ],

  deriveInitial: () => ({}),

  createCommand: (rowId, input) =>
    new SecondmentOutOperation(rowId, {
      secondmentToCompany: input.secondmentToCompany as string,
      departmentCode:      input.departmentCode      as string ?? (input.departmentCode as string) ?? '',
      employmentType:      input.employmentType      as string | undefined,
      transferReason:      input.transferReason      as string | undefined,
    }),
}

// ── 本務出向受入（SF統合先） ──────────────────────────────────────────────────

export const secondmentInSFDef: OperationDef = {
  id:         'SecondmentInSF',
  label:      '本務出向受入（SF統合先）',
  group:      'person',
  badgeColor: 'bg-amber-50 text-amber-600',

  availableFor: (row, cl) =>
    !isSecondmentAcceptance(row, cl) && isMainAssignment(row) && !wasSecondedIn(row),

  inputs: [
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社（SF統合）' },
    { field: 'secondmentFromEmployeeNumber', required: true,  label: '出向元社員番号' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード' },
    { field: 'employmentType',               required: true,  label: '雇用タイプ（出向受入）' },
  ],

  deriveInitial: () => ({}),

  createCommand: (rowId, input) =>
    new SecondmentInOperation(rowId, {
      secondmentFromCompany:        input.secondmentFromCompany as string | undefined,
      secondmentFromEmployeeNumber: input.secondmentFromEmployeeNumber as string | undefined,
      departmentCode:               input.departmentCode        as string | undefined,
      employmentType:               input.employmentType        as string | undefined,
    }),
}

// ── 本務出向受入（SF非統合先） ────────────────────────────────────────────────

export const secondmentInNonSFDef: OperationDef = {
  id:         'SecondmentInNonSF',
  label:      '本務出向受入（SF非統合先）',
  group:      'person',
  badgeColor: 'bg-amber-50 text-amber-600',

  availableFor: (row, cl) =>
    !isSecondmentAcceptance(row, cl) && isMainAssignment(row) && !wasSecondedIn(row),

  inputs: [
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社（SF非統合）' },
    { field: 'secondmentFromEmployeeNumber', required: false, label: '出向元社員番号（任意）' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード' },
    { field: 'employmentType',               required: true,  label: '雇用タイプ（出向受入）' },
  ],

  deriveInitial: () => ({}),

  createCommand: (rowId, input) =>
    new SecondmentInOperation(rowId, {
      secondmentFromCompany:        input.secondmentFromCompany as string | undefined,
      secondmentFromEmployeeNumber: input.secondmentFromEmployeeNumber as string | undefined,
      departmentCode:               input.departmentCode        as string | undefined,
      employmentType:               input.employmentType        as string | undefined,
    }),
}

// ── 兼務出向（SF統合先） ──────────────────────────────────────────────────────

export const concurrentSecondmentOutSFDef: OperationDef = {
  id:         'ConcurrentSecondmentOutSF',
  label:      '兼務出向（SF統合先）',
  group:      'person',
  badgeColor: 'bg-amber-100 text-amber-700',

  availableFor: (row, cl) =>
    isRegularEmployee(row, cl) && isMainAssignment(row),

  inputs: [
    { field: 'secondmentToCompany', required: true,  label: '出向先会社（SF統合）' },
    { field: 'departmentCode',      required: true,  label: '出向先組織コード' },
    { field: 'concurrentReason',    required: false },
  ],

  deriveInitial: () => ({}),

  createCommand: (rowId, input) =>
    new ConcurrentSecondmentOutOperation(rowId, {
      secondmentToCompany: input.secondmentToCompany as string,
      departmentCode:      input.departmentCode      as string,
      concurrentReason:    input.concurrentReason    as string | undefined,
    }),
}

// ── 兼務出向（SF非統合先） ────────────────────────────────────────────────────

export const concurrentSecondmentOutNonSFDef: OperationDef = {
  id:         'ConcurrentSecondmentOutNonSF',
  label:      '兼務出向（SF非統合先）',
  group:      'person',
  badgeColor: 'bg-amber-100 text-amber-700',

  availableFor: (row, cl) =>
    isRegularEmployee(row, cl) && isMainAssignment(row),

  inputs: [
    { field: 'secondmentToCompany', required: true,  label: '出向先会社（SF非統合）' },
    { field: 'departmentCode',      required: false, label: '出向先組織コード（任意）' },
    { field: 'concurrentReason',    required: false },
  ],

  deriveInitial: () => ({}),

  createCommand: (rowId, input) =>
    new ConcurrentSecondmentOutOperation(rowId, {
      secondmentToCompany: input.secondmentToCompany as string,
      departmentCode:      (input.departmentCode as string | undefined) ?? '',
      concurrentReason:    input.concurrentReason    as string | undefined,
    }),
}

// ── 兼務出向受入（SF統合先） ──────────────────────────────────────────────────

export const concurrentSecondmentInSFDef: OperationDef = {
  id:         'ConcurrentSecondmentInSF',
  label:      '兼務出向受入（SF統合先）',
  group:      'person',
  badgeColor: 'bg-amber-50 text-amber-600',

  availableFor: (row) => isMainAssignment(row),

  inputs: [
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社（SF統合）' },
    { field: 'secondmentFromEmployeeNumber', required: true,  label: '出向元社員番号' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード' },
    { field: 'concurrentReason',             required: false },
  ],

  deriveInitial: () => ({}),

  createCommand: (rowId, input) =>
    new ConcurrentSecondmentInOperation(rowId, {
      secondmentFromCompany:        input.secondmentFromCompany        as string,
      secondmentFromEmployeeNumber: input.secondmentFromEmployeeNumber as string | undefined,
      departmentCode:               input.departmentCode               as string,
      concurrentReason:             input.concurrentReason             as string | undefined,
    }),
}

// ── 兼務出向受入（SF非統合先） ────────────────────────────────────────────────

export const concurrentSecondmentInNonSFDef: OperationDef = {
  id:         'ConcurrentSecondmentInNonSF',
  label:      '兼務出向受入（SF非統合先）',
  group:      'person',
  badgeColor: 'bg-amber-50 text-amber-600',

  availableFor: (row) => isMainAssignment(row),

  inputs: [
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社（SF非統合）' },
    { field: 'secondmentFromEmployeeNumber', required: false, label: '出向元社員番号（任意）' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード' },
    { field: 'concurrentReason',             required: false },
  ],

  deriveInitial: () => ({}),

  createCommand: (rowId, input) =>
    new ConcurrentSecondmentInOperation(rowId, {
      secondmentFromCompany:        input.secondmentFromCompany        as string,
      secondmentFromEmployeeNumber: input.secondmentFromEmployeeNumber as string | undefined,
      departmentCode:               input.departmentCode               as string,
      concurrentReason:             input.concurrentReason             as string | undefined,
    }),
}

// ── 共通ヘルパー: 解除操作の inputs ─────────────────────────────────────────

const outReleaseInputs = [
  { field: 'employmentType' as const, required: true,  label: '戻り後の雇用タイプ' },
  { field: 'departmentCode' as const, required: false, label: '戻り先組織コード（任意）' },
  { field: 'transferReason' as const, required: false },
] as const

const inReleaseInputs = [
  { field: 'employmentType' as const, required: false, label: '戻り後の雇用タイプ（任意）' },
  { field: 'transferReason' as const, required: false },
] as const

// ── 本務出向解除（SF導入先）──────────────────────────────────────────────────

export const secondmentOutReleaseSFDef: OperationDef = {
  id: 'SecondmentOutReleaseSF', label: '本務出向解除（SF導入先）',
  group: 'person', badgeColor: 'bg-red-100 text-red-600',
  availableFor: (row, cl) =>
    wasSecondedOut(row) && isMainAssignment(row) &&
    isSFIntegratedCompany(row.prevSecondmentToCompany as string | undefined, cl),
  inputs: [...outReleaseInputs],
  deriveInitial: (row) => ({ employmentType: row.prevEmploymentType as string | undefined }),
  createCommand: (rowId, input) =>
    new SecondmentOutReleaseOperation(rowId, {
      employmentType: input.employmentType as string | undefined,
      departmentCode: input.departmentCode as string | undefined,
      transferReason: input.transferReason as string | undefined,
    }),
}

// ── 本務出向解除（SF未導入先） ────────────────────────────────────────────────

export const secondmentOutReleaseNonSFDef: OperationDef = {
  id: 'SecondmentOutReleaseNonSF', label: '本務出向解除（SF未導入先）',
  group: 'person', badgeColor: 'bg-red-100 text-red-600',
  availableFor: (row, cl) =>
    wasSecondedOut(row) && isMainAssignment(row) &&
    !isSFIntegratedCompany(row.prevSecondmentToCompany as string | undefined, cl),
  inputs: [...outReleaseInputs],
  deriveInitial: (row) => ({ employmentType: row.prevEmploymentType as string | undefined }),
  createCommand: (rowId, input) =>
    new SecondmentOutReleaseOperation(rowId, {
      employmentType: input.employmentType as string | undefined,
      departmentCode: input.departmentCode as string | undefined,
      transferReason: input.transferReason as string | undefined,
    }),
}

// ── 本務出向受入解除（SF導入先） ──────────────────────────────────────────────

export const secondmentInReleaseSFDef: OperationDef = {
  id: 'SecondmentInReleaseSF', label: '本務出向受入解除（SF導入先）',
  group: 'person', badgeColor: 'bg-red-100 text-red-600',
  availableFor: (row, cl) =>
    wasSecondedIn(row) && prevWasSecondmentIn(row, cl) &&
    isSFIntegratedCompany(row.prevSecondmentFromCompany as string | undefined, cl),
  inputs: [
    { field: 'transferReason', required: true, label: '異動事由', readOnly: true },
    { field: 'memo', required: true, label: 'メモ' },
  ],
  deriveInitial: (row) => ({
    transferReason:     '社内兼務解除、兼務出向解除、出向受入・兼務出向受入解除',
    memo:               row.memo as string | undefined,
  }),
  createCommand: (rowId, input) =>
    new SecondmentInReleaseOperation(rowId, {
      employmentType: input.employmentType as string | undefined,
      transferReason: input.transferReason as string | undefined,
    }),
}

// ── 本務出向受入解除（SF未導入先） ────────────────────────────────────────────

export const secondmentInReleaseNonSFDef: OperationDef = {
  id: 'SecondmentInReleaseNonSF', label: '本務出向受入解除（SF未導入先）',
  group: 'person', badgeColor: 'bg-red-100 text-red-600',
  availableFor: (row, cl) =>
    wasSecondedIn(row) && prevWasSecondmentIn(row, cl) &&
    !isSFIntegratedCompany(row.prevSecondmentFromCompany as string | undefined, cl),
  inputs: [
    { field: 'transferReason', required: true, label: '異動事由', readOnly: true },
    { field: 'memo', required: true, label: 'メモ' },
  ],
  deriveInitial: (row) => ({
    transferReason:     '社内兼務解除、兼務出向解除、出向受入・兼務出向受入解除',
    memo:               row.memo as string | undefined,
  }),
  createCommand: (rowId, input) =>
    new SecondmentInReleaseOperation(rowId, {
      employmentType: input.employmentType as string | undefined,
      transferReason: input.transferReason as string | undefined,
    }),
}

// ── 兼務出向解除（SF導入先） ──────────────────────────────────────────────────

export const concurrentSecondmentOutReleaseSFDef: OperationDef = {
  id: 'ConcurrentSecondmentOutReleaseSF', label: '兼務出向解除（SF導入先）',
  group: 'person', badgeColor: 'bg-red-50 text-red-500',
  availableFor: (row, cl) =>
    row.concurrentType === '兼務' && !!row.secondmentToCompany &&
    isSFIntegratedCompany(row.secondmentToCompany as string | undefined, cl),
  inputs: [
    { field: 'transferReason', required: true, label: '異動事由', readOnly: true },
    { field: 'memo', required: true, label: 'メモ' },
  ],
  deriveInitial: (row) => ({
    transferReason:     '社内兼務解除、兼務出向解除、出向受入・兼務出向受入解除',
    memo:               row.memo as string | undefined,
  }),
  createCommand: (rowId) => new ConcurrentSecondmentOutReleaseOperation(rowId),
}

// ── 兼務出向解除（SF未導入先） ────────────────────────────────────────────────

export const concurrentSecondmentOutReleaseNonSFDef: OperationDef = {
  id: 'ConcurrentSecondmentOutReleaseNonSF', label: '兼務出向解除（SF未導入先）',
  group: 'person', badgeColor: 'bg-red-50 text-red-500',
  availableFor: (row, cl) =>
    row.concurrentType === '兼務' && !!row.secondmentToCompany &&
    !isSFIntegratedCompany(row.secondmentToCompany as string | undefined, cl),
  inputs: [
    { field: 'transferReason', required: true, label: '異動事由', readOnly: true },
    { field: 'memo', required: true, label: 'メモ' },
  ],
  deriveInitial: (row) => ({
    transferReason:     '社内兼務解除、兼務出向解除、出向受入・兼務出向受入解除',
    memo:               row.memo as string | undefined,
  }),
  createCommand: (rowId) => new ConcurrentSecondmentOutReleaseOperation(rowId),
}

// ── 兼務出向受入解除（SF導入先） ──────────────────────────────────────────────

export const concurrentSecondmentInReleaseSFDef: OperationDef = {
  id: 'ConcurrentSecondmentInReleaseSF', label: '兼務出向受入解除（SF導入先）',
  group: 'person', badgeColor: 'bg-red-50 text-red-500',
  availableFor: (row, cl) =>
    row.concurrentType === '兼務' && !!row.secondmentFromCompany &&
    isSFIntegratedCompany(row.secondmentFromCompany as string | undefined, cl),
  inputs: [
    { field: 'transferReason', required: true, label: '異動事由', readOnly: true },
    { field: 'memo', required: true, label: 'メモ' },
  ],
  deriveInitial: (row) => ({
    transferReason:     '社内兼務解除、兼務出向解除、出向受入・兼務出向受入解除',
    memo:               row.memo as string | undefined,
  }),
  createCommand: (rowId) => new ConcurrentSecondmentInReleaseOperation(rowId),
}

// ── 兼務出向受入解除（SF未導入先） ────────────────────────────────────────────

export const concurrentSecondmentInReleaseNonSFDef: OperationDef = {
  id: 'ConcurrentSecondmentInReleaseNonSF',
  label: '兼務出向受入解除（SF未導入先）',
  group: 'person', badgeColor: 'bg-red-50 text-red-500',
  availableFor: (row, cl) =>
    row.concurrentType === '兼務' && !!row.secondmentFromCompany &&
    !isSFIntegratedCompany(row.secondmentFromCompany as string | undefined, cl),
  inputs: [
    { field: 'transferReason', required: true, label: '異動事由', readOnly: true },
    { field: 'memo', required: true, label: 'メモ' },
  ],
  deriveInitial: (row) => ({
    transferReason:     '社内兼務解除、兼務出向解除、出向受入・兼務出向受入解除',
    memo:               row.memo as string | undefined,
  }),
  createCommand: (rowId) => new ConcurrentSecondmentInReleaseOperation(rowId),
}

export const DEFS: OperationDef[] = [
  secondmentOutSFDef,              secondmentOutNonSFDef,
  secondmentInSFDef,               secondmentInNonSFDef,
  concurrentSecondmentOutSFDef,    concurrentSecondmentOutNonSFDef,
  concurrentSecondmentInSFDef,     concurrentSecondmentInNonSFDef,
  secondmentOutReleaseSFDef,       secondmentOutReleaseNonSFDef,
  secondmentInReleaseSFDef,        secondmentInReleaseNonSFDef,
  concurrentSecondmentOutReleaseSFDef, concurrentSecondmentOutReleaseNonSFDef,
  concurrentSecondmentInReleaseSFDef,  concurrentSecondmentInReleaseNonSFDef,
]
