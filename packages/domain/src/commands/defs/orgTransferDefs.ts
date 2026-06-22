// 組織への異動 — 社内異動・組織改変
import type { EditOperation } from './types'
import { ok, fail } from '../types'
import { deriveOrgSubFields } from '../orgHelpers'
import { deriveManagerName } from '../../derivation'
import { isMainAssignment } from '../helpers'
import type { AllocationRow } from '../../allocationRow'
import { TR } from '../../transferReasonLabels'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── 社内異動 ─────────────────────────────────────────────────────────────────

// ToDo: この社内異動は部下を持たない場合のフロー。部下がいる場合は別UIが必要
//       （移動先には人だけ移動・部下のポジションは残す・行先ポジションが事前に存在している必要がある）。
export const orgTransferDef: EditOperation = {
  id:         'OrgTransfer',
  label:      '社内異動',
  group:      'position',
  badge:      'transfer',

  availableFor: (row) => !!row.userId && isMainAssignment(row),

  inputs: [
    { field: 'transferReason',  required: false,
      options: [TR.DIV_TRANSFER], optionsMode: 'suggest' },
    { field: 'memo',        required: false },
    { kind: 'section', label: '異動先組織の情報（自動導出）' },
    { field: 'departmentCode',  required: true, label: '異動先組織', picker: 'org' },
    { kind: 'row', inputs: [
      { field: 'businessUnit',  required: false, readOnly: true },
      { field: 'division',      required: false, readOnly: true },
      { field: 'subDivision',   required: false, readOnly: true },
    ]},
    { kind: 'row', inputs: [
      { field: 'group',         required: false, readOnly: true },
      { field: 'location',      required: false, readOnly: true },
      { field: 'costCenter',    required: false, readOnly: true },
    ]},
    // ToDo: positionピッカーで上司を選択したとき、departmentCodeも連動して更新されるようにしたい。
    {
      field:    'managerPositionCode',
      required: false,
      label:    '異動後の上司',
      picker:   'position',
    },
    { field: 'managerName', required: false, readOnly: true },
  ],

  onOpen: (row, ctx) => {
    const mpc       = row.managerPositionCode as string | undefined
    const subFields = deriveOrgSubFields(row.departmentCode as string ?? '', ctx.masters)
    return {
      transferReason:      row.transferReason ?? TR.DIV_TRANSFER as string | undefined,
      memo:                row.memo           ?? '社内異動' as string | undefined,
      departmentCode:      row.departmentCode as string | undefined,
      businessUnit:        subFields.businessUnit,
      division:            subFields.division,
      subDivision:         subFields.subDivision,
      group:               subFields.group,
      location:            subFields.location,
      costCenter:          subFields.costCenter,
      managerPositionCode: mpc,
      managerName:         deriveManagerName(mpc, ctx.allocationList),
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
    const row      = ctx.allocationList.find(r => r.rowId === rowId)!
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
  badge:      'transfer',

  availableFor: () => true,

  inputs: [
    { field: 'transferReason',  required: false,
      options: [TR.DIV_TRANSFER_RESTRUCTURE], optionsMode: 'suggest' },
    { field: 'departmentCode',  required: true, label: '継承先組織コード', picker: 'org' },
    { kind: 'row', inputs: [
      { field: 'businessUnit',  required: false, readOnly: true },
      { field: 'division',      required: false, readOnly: true },
      { field: 'subDivision',   required: false, readOnly: true },
    ]},
    { kind: 'row', inputs: [
      { field: 'group',         required: false, readOnly: true },
      { field: 'location',      required: false, readOnly: true },
      { field: 'costCenter',    required: false, readOnly: true },
    ]},
    { field: 'memo',            required: false },
  ],

  onOpen: (row, ctx) => {
    const subFields = deriveOrgSubFields(row.departmentCode as string ?? '', ctx.masters)
    return {
      transferReason: row.transferReason ?? TR.DIV_TRANSFER_RESTRUCTURE as string | undefined,
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

export const DEFS: EditOperation[] = [orgTransferDef, orgRestructureDef]
