// 組織への異動 — 別組織へ異動・組織コード変更(組改)
import type { EditOperation } from './types'
import { AVAILABLE, unavailable } from './types'
import { ok, fail } from '../types'
import { deriveOrgSubFields } from '../orgHelpers'
import { deriveManagerName, isSecondmentOrg } from '../../rules/derive'
import { isMainAssignment } from '../helpers'
import type { AllocationRow } from '../../allocationRow'
import { TR } from '../../transferReasonLabels'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── 別組織へ異動 ──────────────────────────────────────────────────────────────

// ToDo: この別組織へ異動は部下を持たない場合のフロー。部下がいる場合は別UIが必要
//       （移動先には人だけ移動・部下のポジションは残す・行先ポジションが事前に存在している必要がある）。
export const orgTransferDef: EditOperation = {
  id:                  'OrgTransfer',
  label:               '別組織へ異動',
  group:               'position',
  badge:               'transfer',
  supportsLeaveVacant: true,

  description: '本務行の在席者を別の組織へ異動します。異動先の組織コードを選択すると関係部門〜チームが自動導出されます。勤務場所・コストセンターは自動転記しないため、マスタと異なる場合は手動で修正してください。部下がいる場合は個別対応が必要です。',
  entryPoints:     ['personMenu', 'dragIntent'],
  availabilityNote: '在席者（userId あり）の本務行。ドラッグで組織パネルにドロップしても起動できる。ロック操作中は不可。',

  availableFor(row) {
    if (!row.userId)          return unavailable('担当者が配属されていない行には設定できません')
    if (!isMainAssignment(row)) return unavailable('本務行のみ対象です（兼務行には設定できません）')
    return AVAILABLE
  },

  // 簡易モード: 異動先組織と異動事由だけ入力。上司は onFieldChange.departmentCode で自動導出
  quickInputs: [
    { field: 'transferReason', required: false, options: [TR.DIV_TRANSFER], optionsMode: 'suggest' },
    { field: 'departmentCode', required: true,  label: '異動先組織', picker: 'org' },
  ],

  inputs: [
    { field: 'transferReason',  required: false,
      options: [TR.DIV_TRANSFER], optionsMode: 'suggest' },
    { field: 'memo',        required: false },
    { kind: 'section', label: '異動先組織の情報' },
    { field: 'departmentCode',  required: true, label: '組織コード', picker: 'org' },
    { field: 'businessUnit',    required: false, readOnly: true },
    { field: 'division',        required: false, readOnly: true },
    { field: 'subDivision',     required: false, readOnly: true },
    { field: 'group',           required: false, readOnly: true },
    { field: 'team',            required: false, readOnly: true },
    {
      field:     'location',
      required:  false,
      label:     '勤務場所',
      warningFn: (ctx, values) => {
        const deptCode = values.departmentCode as string | undefined
        if (!deptCode) return undefined
        const masterLoc = deriveOrgSubFields(deptCode, ctx.masters).location
        if (!masterLoc) return undefined
        const formLoc = values.location as string | undefined
        if (masterLoc !== formLoc) return `マスタの勤務場所（${masterLoc}）と異なります`
        return undefined
      },
    },
    {
      field:     'costCenter',
      required:  false,
      label:     'コストセンター',
      warningFn: (ctx, values) => {
        const deptCode = values.departmentCode as string | undefined
        if (!deptCode) return undefined
        const masterCC = deriveOrgSubFields(deptCode, ctx.masters).costCenter
        if (!masterCC) return undefined
        const formCC = values.costCenter as string | undefined
        if (masterCC !== formCC) return `マスタのコストセンター（${masterCC}）と異なります`
        return undefined
      },
    },
    {
      field:    'managerPositionCode',
      required: false,
      label:    '異動後の上司',
      picker:   'managerPosition',
    },
  ],

  // 組織コード変更時: 勤務場所・コストセンターは自動転記しない
  onFieldChange: {
    departmentCode: () => ({ excludeDerived: ['location', 'costCenter'] }),
  },

  onOpen: (row, ctx) => {
    const mpc       = row.managerPositionCode as string | undefined
    const subFields = deriveOrgSubFields(row.departmentCode as string ?? '', ctx.masters)
    return {
      transferReason:      row.transferReason ?? TR.DIV_TRANSFER as string | undefined,
      memo:                row.memo           ?? '別組織へ異動' as string | undefined,
      departmentCode:      row.departmentCode as string | undefined,
      businessUnit:        subFields.businessUnit,
      division:            subFields.division,
      subDivision:         subFields.subDivision,
      group:               subFields.group,
      team:                subFields.team,
      // 勤務場所・コストセンターはマスタから転記せず、現在の行の値を維持する
      location:            row.location   as string | undefined,
      costCenter:          row.costCenter as string | undefined,
      managerPositionCode: mpc,
      // 導出失敗時は Excel から読んだ名前をフォールバックとして保持
      managerName:         deriveManagerName(mpc, ctx.allocationList) ?? (row.managerName as string | undefined),
    }
  },

  createCommand(rowId, values) {
    return {
      kind: 'OrgTransfer',
      validate(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)
        if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
        if (!values.departmentCode) return fail('組織コードは必須です')
        const srcIsSecondment = isSecondmentOrg(row.departmentCode as string ?? '', ctx.masters)
        const tgtIsSecondment = isSecondmentOrg(values.departmentCode as string, ctx.masters)
        if (!srcIsSecondment && tgtIsSecondment)
          return fail('通常組織から出向者用組織への異動は「本務出向」操作を使用してください')
        if (srcIsSecondment && !tgtIsSecondment)
          return fail('出向者用組織から通常組織への異動は「本務出向解除」操作を使用してください')
        return ok()
      },
      apply(ctx) {
        const row      = ctx.allocationList.find(r => r.rowId === rowId)!
        const deptCode = values.departmentCode as string
        const orgName  = ctx.afterOrganizations.find(o => o.externalCode === deptCode)?.name ?? deptCode
        const { location: _l, costCenter: _cc, ...orgSubFields } = deriveOrgSubFields(deptCode, ctx.masters)
        const managerFields = values.managerPositionCode !== undefined
          ? { managerPositionCode: values.managerPositionCode, managerName: values.managerName }
          : {}
        return {
          updatedList: ctx.allocationList.map(r =>
            r.rowId === rowId
              ? {
                  ...r,
                  departmentCode: deptCode,
                  ...orgSubFields,
                  location:   values.location   as string | undefined,
                  costCenter: values.costCenter as string | undefined,
                  ...managerFields,
                  memo: values.memo as string | undefined,
                }
              : r
          ),
          label: `別組織へ異動: ${personName(row)} → ${orgName}`,
        }
      },
    }
  },
}

// ── 組織コード変更(組改) ──────────────────────────────────────────────────────
//
// 組織改編（組改）に伴い、在席者の組織コードを新コードに付け替える操作。
// 関係部門〜チームは組織コード選択で自動導出（readOnly）。
// 勤務場所・コストセンターは自動転記しない。マスタと不一致の場合は警告を表示する。

export const orgRestructureDef: EditOperation = {
  id:    'OrgRestructure',
  label: '組織コード変更(組改)',
  group: 'position',
  badge: 'transfer',

  description: '組織改編（組改）に伴い、在席者の組織コードを新しいコードに付け替えます。在席者はそのまま維持され、組織コードのみ変更されます。勤務場所・コストセンターは自動転記しないため、マスタと異なる場合は手動で修正してください。',
  entryPoints:     ['personMenu', 'dragIntent'],
  availabilityNote: '在席者（userId あり）または空席ポジションの本務行。組織改編による組織コード付け替えに使う。ロック操作中は不可。',

  availableFor: () => AVAILABLE,

  inputs: [
    { field: 'transferReason',  required: false,
      options: [TR.DIV_TRANSFER_RESTRUCTURE], optionsMode: 'suggest' },
    { field: 'departmentCode',  required: true, label: '組織コード', picker: 'org' },
    { field: 'businessUnit',    required: false, readOnly: true },
    { field: 'division',        required: false, readOnly: true },
    { field: 'subDivision',     required: false, readOnly: true },
    { field: 'group',           required: false, readOnly: true },
    { field: 'team',            required: false, readOnly: true },
    {
      field:     'location',
      required:  false,
      label:     '勤務場所',
      warningFn: (ctx, values) => {
        const deptCode = values.departmentCode as string | undefined
        if (!deptCode) return undefined
        const masterLoc = deriveOrgSubFields(deptCode, ctx.masters).location
        if (!masterLoc) return undefined
        const formLoc = values.location as string | undefined
        if (masterLoc !== formLoc) return `マスタの勤務場所（${masterLoc}）と異なります`
        return undefined
      },
    },
    {
      field:     'costCenter',
      required:  false,
      label:     'コストセンター',
      warningFn: (ctx, values) => {
        const deptCode = values.departmentCode as string | undefined
        if (!deptCode) return undefined
        const masterCC = deriveOrgSubFields(deptCode, ctx.masters).costCenter
        if (!masterCC) return undefined
        const formCC = values.costCenter as string | undefined
        if (masterCC !== formCC) return `マスタのコストセンター（${masterCC}）と異なります`
        return undefined
      },
    },
    { field: 'memo', required: false },
  ],

  // 組織コード変更時: 勤務場所・コストセンターは自動転記しない
  onFieldChange: {
    departmentCode: () => ({ excludeDerived: ['location', 'costCenter'] }),
  },

  onOpen: (row, ctx) => {
    const subFields = deriveOrgSubFields(row.departmentCode as string ?? '', ctx.masters)
    return {
      transferReason: row.transferReason ?? TR.DIV_TRANSFER_RESTRUCTURE as string | undefined,
      departmentCode: row.departmentCode as string | undefined,
      businessUnit:   subFields.businessUnit,
      division:       subFields.division,
      subDivision:    subFields.subDivision,
      group:          subFields.group,
      team:           subFields.team,
      // 勤務場所・コストセンターはマスタから転記せず、現在の行の値を維持する
      location:       row.location   as string | undefined,
      costCenter:     row.costCenter as string | undefined,
      memo:           row.memo       as string | undefined,
    }
  },

  createCommand(rowId, values) {
    return {
      kind: 'OrgRestructure',
      validate(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)
        if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
        if (!values.departmentCode) return fail('組織コードは必須です')
        const srcIsSecondment = isSecondmentOrg(row.departmentCode as string ?? '', ctx.masters)
        const tgtIsSecondment = isSecondmentOrg(values.departmentCode as string, ctx.masters)
        if (!srcIsSecondment && tgtIsSecondment)
          return fail('通常組織から出向者用組織への変更は「本務出向」操作を使用してください')
        if (srcIsSecondment && !tgtIsSecondment)
          return fail('出向者用組織から通常組織への変更は「本務出向解除」操作を使用してください')
        return ok()
      },
      apply(ctx) {
        const row      = ctx.allocationList.find(r => r.rowId === rowId)!
        const deptCode = values.departmentCode as string
        const orgName  = ctx.afterOrganizations.find(o => o.externalCode === deptCode)?.name ?? deptCode
        const { location: _l, costCenter: _cc, ...orgSubFields } = deriveOrgSubFields(deptCode, ctx.masters)
        return {
          updatedList: ctx.allocationList.map(r =>
            r.rowId === rowId
              ? {
                  ...r,
                  departmentCode: deptCode,
                  ...orgSubFields,
                  location:   values.location   as string | undefined,
                  costCenter: values.costCenter as string | undefined,
                  memo: values.memo as string | undefined,
                }
              : r
          ),
          label: `組織コード変更: ${personName(row)} → ${orgName}`,
        }
      },
    }
  },
}

export const DEFS: EditOperation[] = [orgTransferDef, orgRestructureDef]
