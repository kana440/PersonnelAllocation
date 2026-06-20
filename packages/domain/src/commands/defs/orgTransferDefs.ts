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
  badge: 'transfer',

  availableFor: (row) => !!row.userId && isMainAssignment(row),

  inputs: [
    { field: 'transferReason',  required: false,
      options: ['分掌移動（改組）', '分掌移動'] },
    { field: 'departmentCode',  required: true, label: '異動先組織', picker: 'org' },
    { field: 'businessUnit',    required: false, readOnly: true },
    { field: 'division',        required: false, readOnly: true },
    { field: 'subDivision',     required: false, readOnly: true },
    { field: 'group',           required: false, readOnly: true },
    { field: 'location',        required: false, readOnly: true },
    { field: 'costCenter',      required: false, readOnly: true },
    {
      field:    'managerPositionCode',
      required: false,
      label:    '異動後の上司',
      picker:   'position',
    },
    { field: 'managerName', required: false, readOnly: true },
    { field: 'memo',        required: false },
  ],

  onOpen: (row, ctx) => {
    const mpc      = row.managerPositionCode as string | undefined
    const subFields = deriveOrgSubFields(row.departmentCode as string ?? '', ctx.masters)
    return {
      transferReason:      row.transferReason as string | undefined,
      departmentCode:      row.departmentCode as string | undefined,
      businessUnit:        subFields.businessUnit,
      division:            subFields.division,
      subDivision:         subFields.subDivision,
      group:               subFields.group,
      location:            subFields.location,
      costCenter:          subFields.costCenter,
      managerPositionCode: mpc,
      managerName:         deriveManagerName(mpc, ctx.allocationList),
      memo:                row.memo           as string | undefined,
    }
  },

  onValidate(ctx, rowId, values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.departmentCode)
      return fail('組織コードは必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row     = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string
    const orgName  = ctx.afterOrganizations.find(o => o.externalCode === deptCode)?.name ?? deptCode
    const subFields = deriveOrgSubFields(deptCode, ctx.masters)
    const managerFields = values.managerPositionCode !== undefined
      ? { managerPositionCode: values.managerPositionCode, managerName: values.managerName }
      : {}
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? { ...r, departmentCode: deptCode, ...subFields, ...managerFields, memo: values.memo as string | undefined }
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
  badge: 'transfer',

  availableFor: () => true,

  inputs: [
    { field: 'transferReason',  required: false,
      options: (ctx) => ctx.masters.transferReasons
        .map(r => r.label)
        .filter(l => l.includes('改組') || l === '分掌移動') },
    { field: 'departmentCode',  required: true, label: '継承先組織コード', picker: 'org' },
    { field: 'businessUnit',    required: false, readOnly: true },
    { field: 'division',        required: false, readOnly: true },
    { field: 'subDivision',     required: false, readOnly: true },
    { field: 'group',           required: false, readOnly: true },
    { field: 'location',        required: false, readOnly: true },
    { field: 'costCenter',      required: false, readOnly: true },
    { field: 'memo',            required: false },
  ],

  onOpen: (row, ctx) => {
    const subFields = deriveOrgSubFields(row.departmentCode as string ?? '', ctx.masters)
    return {
      transferReason: row.transferReason as string | undefined,
      departmentCode: row.departmentCode as string | undefined,
      businessUnit:   subFields.businessUnit,
      division:       subFields.division,
      subDivision:    subFields.subDivision,
      group:          subFields.group,
      location:       subFields.location,
      costCenter:     subFields.costCenter,
      memo:           row.memo           as string | undefined,
    }
  },

  onValidate(ctx, rowId, values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.departmentCode)
      return fail('継承先の組織コードは必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row      = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string
    const orgName  = ctx.afterOrganizations.find(o => o.externalCode === deptCode)?.name ?? deptCode
    const subFields = deriveOrgSubFields(deptCode, ctx.masters)
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? { ...r, departmentCode: deptCode, ...subFields, memo: values.memo as string | undefined }
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
  badge: 'transfer',

  availableFor: (row) => !!row.positionCode,

  inputs: [
    { field: 'transferReason', required: false },
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
          ? { ...r, managerPositionCode: values.managerPositionCode, managerName: values.managerName, memo: values.memo as string | undefined }
          : r
      ),
      label: `上司変更: ${personName(row)}`,
    }
  },
}

export const DEFS: EditOperation[] = [orgTransferDef, orgRestructureDef, managerChangeDef]
