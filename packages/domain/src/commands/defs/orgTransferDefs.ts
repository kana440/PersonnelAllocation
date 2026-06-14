// 組織への異動 — 社内異動・組織改変・上司変更
import type { EditOperation } from './types'
import { ok, fail } from '../types'
import { deriveOrgSubFields } from '../orgHelpers'
import { deriveManagerName } from '../../derivation'
import { isMainAssignment, getDescendantPositionCodes } from '../helpers'
import type { AllocationRow } from '../../allocationRow'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── 社内異動 ─────────────────────────────────────────────────────────────────

export const orgTransferDef: EditOperation = {
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

  validate(ctx, rowId, values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.departmentCode)
      return fail('組織コードは必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row     = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string
    const orgName  = ctx.afterOrganizations.find(o => o.externalCode === deptCode)?.name ?? deptCode
    const subFields = deriveOrgSubFields(deptCode, ctx.codeLists)
    const managerFields = values.managerPositionCode !== undefined
      ? { managerPositionCode: values.managerPositionCode, managerName: values.managerName }
      : {}
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? { ...r, departmentCode: deptCode, ...subFields, ...managerFields }
          : r
      ),
      label: `組織異動: ${personName(row)} → ${orgName}`,
    }
  },
}

// ── 組織改変 ─────────────────────────────────────────────────────────────────

export const orgRestructureDef: EditOperation = {
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

  validate(ctx, rowId, values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.departmentCode)
      return fail('継承先の組織コードは必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row      = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string
    const orgName  = ctx.afterOrganizations.find(o => o.externalCode === deptCode)?.name ?? deptCode
    const subFields = deriveOrgSubFields(deptCode, ctx.codeLists)
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? { ...r, departmentCode: deptCode, ...subFields }
          : r
      ),
      label: `組織改変: ${personName(row)} → ${orgName}`,
    }
  },
}

// ── 上司変更 ─────────────────────────────────────────────────────────────────

export const managerChangeDef: EditOperation = {
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

  validate(ctx, rowId, _values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? { ...r, managerPositionCode: values.managerPositionCode, managerName: values.managerName }
          : r
      ),
      label: `上司変更: ${personName(row)}`,
    }
  },
}

export const DEFS: EditOperation[] = [orgTransferDef, orgRestructureDef, managerChangeDef]
