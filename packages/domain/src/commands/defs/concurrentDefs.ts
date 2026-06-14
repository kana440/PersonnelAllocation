// 兼務 — 社内兼務追加・解除
import type { OperationDef } from './types'
import { ConcurrentAddOperation, ConcurrentReleaseOperation } from '../handlers/concurrentOps'
import { isMainAssignment } from '../helpers'

// ── 社内兼務追加 ──────────────────────────────────────────────────────────────

export const concurrentAddDef: OperationDef = {
  id:         'ConcurrentAdd',
  label:      '社内兼務追加',
  group:      'position',
  badgeColor: 'bg-cyan-100 text-cyan-700',

  availableFor: (row) => !!row.userId && isMainAssignment(row),

  inputs: [
    { field: 'departmentCode',   required: true,  label: '兼務先組織' },
    { field: 'concurrentReason', required: false },
  ],

  deriveInitial: () => ({}),

  createCommand: (rowId, input) =>
    new ConcurrentAddOperation(
      rowId,
      input.departmentCode   as string,
      input.concurrentReason as string | undefined,
    ),
}

// ── 社内兼務解除 ──────────────────────────────────────────────────────────────

export const concurrentReleaseDef: OperationDef = {
  id:         'ConcurrentRelease',
  label:      '社内兼務解除',
  group:      'position',
  badgeColor: 'bg-cyan-50 text-cyan-600',

  availableFor: (row) =>
    row.concurrentType === '兼務' &&
    !row.secondmentToCompany &&
    !row.secondmentFromCompany,

  inputs: [],

  deriveInitial: () => ({}),

  createCommand: (rowId) => new ConcurrentReleaseOperation(rowId),
}

export const DEFS: OperationDef[] = [concurrentAddDef, concurrentReleaseDef]
