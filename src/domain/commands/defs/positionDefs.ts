// ポジション操作 — 社内異動・組織改変・上司変更・社内兼務追加/解除
import type { OperationDef } from './types'
import { OrgTransferOperation, ManagerChangeOperation } from '../handlers/patternOps'
import { OrgRestructureOperation } from '../handlers/transferOps'
import { ConcurrentAddOperation, ConcurrentReleaseOperation } from '../handlers/concurrentOps'
import { deriveManagerName } from '../../derivation'
import { isMainAssignment } from '../helpers'

// ── 社内異動 ─────────────────────────────────────────────────────────────────

export const orgTransferDef: OperationDef = {
  id:         'OrgTransfer',
  label:      '社内異動',
  group:      'position',
  badgeColor: 'bg-blue-100 text-blue-700',

  availableFor: (row) => !!row.userId && isMainAssignment(row),

  inputs: [
    { field: 'departmentCode', required: true,  label: '異動先組織' },
    { field: 'positionCode',   required: false, label: '新ポジションコード' },
    { field: 'localJobTitle',  required: false },
    { field: 'transferReason', required: true  },
  ],

  deriveInitial: (row) => ({
    departmentCode: row.departmentCode as string | undefined,
  }),

  createCommand: (rowId, input) =>
    new OrgTransferOperation(rowId, input.departmentCode as string),
}

// ── 組織改変 ─────────────────────────────────────────────────────────────────

export const orgRestructureDef: OperationDef = {
  id:         'OrgRestructure',
  label:      '組織改変',
  group:      'position',
  badgeColor: 'bg-indigo-100 text-indigo-700',

  availableFor: () => true,

  inputs: [
    { field: 'departmentCode', required: true, label: '継承先組織コード' },
  ],

  deriveInitial: (row) => ({
    departmentCode: row.departmentCode as string | undefined,
  }),

  createCommand: (rowId, input) =>
    new OrgRestructureOperation(rowId, input.departmentCode as string),
}

// ── 上司変更 ─────────────────────────────────────────────────────────────────

export const managerChangeDef: OperationDef = {
  id:         'ManagerChange',
  label:      '上司変更',
  group:      'position',
  badgeColor: 'bg-slate-100 text-slate-700',

  availableFor: (row) => !!row.positionCode,

  inputs: [
    { field: 'managerPositionCode', required: true },
  ],

  deriveInitial: (row, ctx) => {
    const mpc = row.managerPositionCode as string | undefined
    return {
      managerPositionCode: mpc,
      managerName: deriveManagerName(mpc, ctx.allocationList),
    }
  },

  createCommand: (rowId, input) =>
    new ManagerChangeOperation(
      rowId,
      input.managerPositionCode as string | undefined,
      input.managerName as string | undefined,
    ),
}

// ── 社内兼務追加 ──────────────────────────────────────────────────────────────

export const concurrentAddDef: OperationDef = {
  id:         'ConcurrentAdd',
  label:      '社内兼務追加',
  group:      'position',
  badgeColor: 'bg-cyan-100 text-cyan-700',

  availableFor: (row) => !!row.userId && isMainAssignment(row),

  inputs: [
    { field: 'departmentCode',  required: true,  label: '兼務先組織' },
    { field: 'concurrentReason', required: false },
  ],

  deriveInitial: () => ({}),

  createCommand: (rowId, input) =>
    new ConcurrentAddOperation(
      rowId,
      input.departmentCode  as string,
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
