// 組織への異動 — 社内異動・組織改変・上司変更
import type { OperationDef } from './types'
import { OrgTransferOperation, OrgRestructureOperation, ManagerChangeOperation } from '../handlers/orgTransferOps'
import { deriveManagerName } from '../../derivation'
import { isMainAssignment, getDescendantPositionCodes } from '../helpers'

// ── 社内異動 ─────────────────────────────────────────────────────────────────

export const orgTransferDef: OperationDef = {
  id:         'OrgTransfer',
  label:      '社内異動',
  group:      'position',
  badgeColor: 'bg-blue-100 text-blue-700',

  availableFor: (row) => !!row.userId && isMainAssignment(row),

  inputs: [
    { field: 'departmentCode', required: true, label: '異動先組織', picker: 'org' },
    { field: 'businessUnit', required: false, readOnly: true },
    { field: 'division',     required: false, readOnly: true },
    { field: 'subDivision',  required: false, readOnly: true },
    { field: 'group',        required: false, readOnly: true },
    {
      field:    'managerPositionCode',
      required: false,
      label:    '異動後の上司',
      picker:   'position',
    },
    { field: 'managerName', required: false, readOnly: true },
  ],

  deriveInitial: (row, ctx) => {
    const mpc = row.managerPositionCode as string | undefined
    return {
      departmentCode:      row.departmentCode as string | undefined,
      managerPositionCode: mpc,
      managerName:         deriveManagerName(mpc, ctx.allocationList),
    }
  },

  createCommand: (rowId, input) =>
    new OrgTransferOperation(rowId, {
      departmentCode:      input.departmentCode      as string,
      managerPositionCode: input.managerPositionCode as string | undefined,
      managerName:         input.managerName         as string | undefined,
    }),
}

// ── 組織改変 ─────────────────────────────────────────────────────────────────

export const orgRestructureDef: OperationDef = {
  id:         'OrgRestructure',
  label:      '組織改変',
  group:      'position',
  badgeColor: 'bg-indigo-100 text-indigo-700',

  availableFor: () => true,

  inputs: [
    { field: 'departmentCode', required: true, label: '継承先組織コード', picker: 'org' },
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
    {
      field:          'managerPositionCode',
      required:       true,
      picker:         'position',
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

export const DEFS: OperationDef[] = [orgTransferDef, orgRestructureDef, managerChangeDef]
