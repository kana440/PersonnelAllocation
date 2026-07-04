// 兼務出向操作 — 出向/受入・解除（SF統合・非統合）
import type { EditOperation } from './types'
import { AVAILABLE, unavailable } from './types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding, nextRowId } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'
import { isRegularEmployee, isMainAssignment, isSFIntegratedCompany, isNewRow } from '../helpers'
import { vacatePosition, getDirectSubordinates } from './positionVacant'
import { TR } from '../../transferReasonLabels'
import { inReleaseInputs, inReleaseInitial } from './secondmentMainDefs'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── 兼務出向（SF非統合先のみ） ────────────────────────────────────────────────

export const concurrentSecondmentOutNonSFDef: EditOperation = {
  id:    'ConcurrentSecondmentOutNonSF',
  label: '兼務出向（SF非統合先）',
  group: 'secondmentConcurrent',
  badge: 'secondment',

  availableFor(row, ms) {
    if (!isRegularEmployee(row, ms)) return unavailable('正社員のみ対象です')
    if (!isMainAssignment(row))      return unavailable('本務行のみ対象です（兼務行には設定できません）')
    return AVAILABLE
  },

  inputs: [
    { field: 'transferReason',      required: false },
    { field: 'secondmentToCompany', required: true,  label: '出向先会社（SF非統合）' },
    { field: 'departmentCode',      required: false, label: '出向先組織コード（任意）' },
    { field: 'concurrentReason',    required: false },
    { field: 'memo',                required: false },
  ],

  onOpen: (row) => ({
    transferReason: row.transferReason as string | undefined,
    memo:           row.memo           as string | undefined,
  }),

  createCommand(rowId, values) {
    return {
      kind: 'ConcurrentSecondmentOutNonSF',
      validate(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)
        if (!row)        return fail(`行が見つかりません (rowId: ${rowId})`)
        if (!row.userId) return fail('人が配属されていない行に兼務出向を追加できません')
        if (row.concurrentType === '兼務') return fail('兼務行には兼務出向を追加できません')
        if (!values.secondmentToCompany)   return fail('出向先会社は必須です')
        return ok()
      },
      apply(ctx) {
        const src      = ctx.allocationList.find(r => r.rowId === rowId)!
        const newRowId = nextRowId(ctx.allocationList)
        const posClears = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
        const deptCode  = (values.departmentCode as string | undefined) ?? ''
        const orgSub    = deptCode ? deriveOrgSubFields(deptCode, ctx.masters) : {}
        const newRow: AllocationRow = {
          ...src,
          ...posClears,
          ...orgSub,
          rowId:                   newRowId,
          positionCode:            `_pos_${newRowId}`,
          departmentCode:          deptCode,
          concurrentType:          '兼務',
          concurrentReason:        values.concurrentReason as string | undefined,
          secondmentToCompany:     values.secondmentToCompany as string,
          memo:                    values.memo as string | undefined,
          prevDepartmentCode:      undefined,
          prevPositionCode:        undefined,
          prevConcurrentType:      undefined,
          prevSecondmentToCompany: undefined,
        } as AllocationRow
        return {
          updatedList: [...ctx.allocationList, newRow],
          label: `兼務出向追加: ${personName(src)} → ${values.secondmentToCompany as string}`,
        }
      },
    }
  },
}

// ── 兼務出向受入 新規（SF統合・SF外共通） ────────────────────────────────────────

export const concurrentSecondmentInNewDef: EditOperation = {
  id:    'ConcurrentSecondmentInNew',
  label: '兼務出向受入 新規',
  group: 'secondmentConcurrent',
  badge: 'secondment',

  operationRole: {
    kind:                'lock',
    isActive:            (row) => isNewRow(row) && (row.transferReason as string | undefined) === TR.CONCURRENT_SECONDMENT_IN,
    isActiveThisSession: (row) => isNewRow(row) && (row.transferReason as string | undefined) === TR.CONCURRENT_SECONDMENT_IN,
  },

  availableFor(row) {
    if (!isNewRow(row)) return unavailable('新規追加された行のみ対象です')
    if ((row.transferReason as string | undefined) !== TR.CONCURRENT_SECONDMENT_IN) return unavailable('兼務出向受入（新規）として作成された行のみ対象です')
    return AVAILABLE
  },

  inputs: [
    { field: 'userId',                       required: false, picker: 'person' },
    { field: 'groupEmployeeId',              required: false },
    { field: 'employeeNumber',               required: false },
    { field: 'lastName',                     required: true  },
    { field: 'firstName',                    required: true  },
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社' },
    { field: 'secondmentFromEmployeeNumber', required: false, label: '出向元社員番号（任意）' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード', picker: 'org' },
    { field: 'employmentType',               required: true,  label: '雇用タイプ（出向受入）',
      options: (ctx) => ctx.masters.employmentTypes.filter(e => e.isSecondmentAcceptance).map(e => e.label) },
    { field: 'concurrentReason',             required: true  },
    { field: 'positionBand',                 required: false },
    { field: 'band',                         required: false,
      options: (ctx) => ctx.masters.jobLevels.filter(e => e.isSecondmentAcceptance).map(e => e.label) },
    { field: 'payGrade',                     required: false,
      options: (ctx) => ctx.masters.payGrades.filter(e => e.isSecondmentAcceptance).map(e => e.label) },
    { field: 'memo',                         required: false },
    { kind: 'section', label: '自動設定される項目' },
    { field: 'transferReason', required: false, readOnly: true, label: '申請区分' },
    { field: 'concurrentType', required: false, readOnly: true, label: '本務兼務区分' },
  ],

  onOpen: (row) => ({
    departmentCode: row.departmentCode,
    transferReason: TR.CONCURRENT_SECONDMENT_IN,
    concurrentType: '兼務',
  }),

  createCommand(_rowId, values) {
    return {
      kind: 'ConcurrentSecondmentInNew',
      validate() {
        if (!values.lastName)              return fail('姓は必須です')
        if (!values.firstName)             return fail('名は必須です')
        if (!values.secondmentFromCompany) return fail('出向元会社は必須です')
        if (!values.departmentCode)        return fail('受入先組織コードは必須です')
        if (!values.employmentType)        return fail('雇用タイプは必須です')
        if (!values.concurrentReason)      return fail('兼務理由は必須です')
        return ok()
      },
      apply(ctx) {
        const newRowId = nextRowId(ctx.allocationList)
        const orgSub   = values.departmentCode
          ? deriveOrgSubFields(values.departmentCode as string, ctx.masters)
          : {}
        const formVals = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== ''))
        const name     = [values.lastName, values.firstName].filter(Boolean).join(' ')
        const newRow: AllocationRow = {
          ...orgSub,
          ...formVals,
          rowId:                newRowId,
          positionCode:         `_pos_${newRowId}`,
          departmentCode:       (values.departmentCode as string) || '',
          concurrentType:       '兼務',
          transferReason:       TR.CONCURRENT_SECONDMENT_IN,
          trainingPositionFlag: '0',
          userId:               (values.userId as string | undefined) || undefined,
        } as AllocationRow
        return {
          updatedList: [...ctx.allocationList, newRow],
          label: `兼務出向受入（新規）: ${name} ← ${values.secondmentFromCompany as string ?? ''}`,
        }
      },
    }
  },
}

// ── 兼務出向解除（SF導入先） ──────────────────────────────────────────────────

export const concurrentSecondmentOutReleaseSFDef: EditOperation = {
  id: 'ConcurrentSecondmentOutReleaseSF', label: '兼務出向解除（SF導入先）',
  group: 'secondmentConcurrent', badge: 'negative',

  availableFor(row, ms) {
    if (row.concurrentType !== '兼務') return unavailable('兼務行のみ対象です')
    if (!row.secondmentToCompany)      return unavailable('出向先が設定されていない兼務行は対象外です')
    if (!isSFIntegratedCompany(row.secondmentToCompany as string | undefined, ms))
      return unavailable('SF未導入先の兼務出向解除は「SF未導入先」操作を使用してください')
    return AVAILABLE
  },

  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  createCommand(rowId) {
    return {
      kind: 'ConcurrentSecondmentOutReleaseSF',
      validate(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)
        if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
        if (row.concurrentType !== '兼務' || !row.secondmentToCompany)
          return fail('兼務出向行ではありません（concurrentType=兼務 かつ secondmentToCompany が必要）')
        return ok()
      },
      apply(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)!
        return { updatedList: ctx.allocationList.filter(r => r.rowId !== rowId), label: `兼務出向解除: ${personName(row)}` }
      },
    }
  },
}

// ── 兼務出向解除（SF未導入先） ────────────────────────────────────────────────

export const concurrentSecondmentOutReleaseNonSFDef: EditOperation = {
  id: 'ConcurrentSecondmentOutReleaseNonSF', label: '兼務出向解除（SF未導入先）',
  group: 'secondmentConcurrent', badge: 'negative',

  availableFor(row, ms) {
    if (row.concurrentType !== '兼務') return unavailable('兼務行のみ対象です')
    if (!row.secondmentToCompany)      return unavailable('出向先が設定されていない兼務行は対象外です')
    if (isSFIntegratedCompany(row.secondmentToCompany as string | undefined, ms))
      return unavailable('SF導入先の兼務出向解除は「SF導入先」操作を使用してください')
    return AVAILABLE
  },

  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  createCommand(rowId) {
    return {
      kind: 'ConcurrentSecondmentOutReleaseNonSF',
      validate(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)
        if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
        if (row.concurrentType !== '兼務' || !row.secondmentToCompany)
          return fail('兼務出向行ではありません（concurrentType=兼務 かつ secondmentToCompany が必要）')
        return ok()
      },
      apply(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)!
        return { updatedList: ctx.allocationList.filter(r => r.rowId !== rowId), label: `兼務出向解除: ${personName(row)}` }
      },
    }
  },
}

// ── 兼務出向受入解除（SF導入先） ──────────────────────────────────────────────

export const concurrentSecondmentInReleaseSFDef: EditOperation = {
  id: 'ConcurrentSecondmentInReleaseSF', label: '兼務出向受入解除（SF導入先）',
  group: 'secondmentConcurrent', badge: 'negative',

  availableFor(row, ms) {
    if (row.concurrentType !== '兼務') return unavailable('兼務行のみ対象です')
    if (!row.secondmentFromCompany)    return unavailable('出向受入元が設定されていない兼務行は対象外です')
    if (!isSFIntegratedCompany(row.secondmentFromCompany as string | undefined, ms))
      return unavailable('SF未導入先の兼務出向受入解除は「SF未導入先」操作を使用してください')
    return AVAILABLE
  },

  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  createCommand(rowId) {
    return {
      kind: 'ConcurrentSecondmentInReleaseSF',
      validate(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)
        if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
        if (row.concurrentType !== '兼務' || !row.secondmentFromCompany)
          return fail('兼務出向受入行ではありません（concurrentType=兼務 かつ secondmentFromCompany が必要）')
        return ok()
      },
      apply(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)!
        return { updatedList: ctx.allocationList.filter(r => r.rowId !== rowId), label: `兼務出向受入解除: ${personName(row)}` }
      },
    }
  },
}

// ── 兼務出向受入解除（SF未導入先） ────────────────────────────────────────────

export const concurrentSecondmentInReleaseNonSFDef: EditOperation = {
  id: 'ConcurrentSecondmentInReleaseNonSF', label: '兼務出向受入解除（SF未導入先）',
  group: 'secondmentConcurrent', badge: 'negative',

  availableFor(row, ms) {
    if (row.concurrentType !== '兼務') return unavailable('兼務行のみ対象です')
    if (!row.secondmentFromCompany)    return unavailable('出向受入元が設定されていない兼務行は対象外です')
    if (isSFIntegratedCompany(row.secondmentFromCompany as string | undefined, ms))
      return unavailable('SF導入先の兼務出向受入解除は「SF導入先」操作を使用してください')
    return AVAILABLE
  },

  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  createCommand(rowId) {
    return {
      kind: 'ConcurrentSecondmentInReleaseNonSF',
      validate(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)
        if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
        if (row.concurrentType !== '兼務' || !row.secondmentFromCompany)
          return fail('兼務出向受入行ではありません（concurrentType=兼務 かつ secondmentFromCompany が必要）')
        return ok()
      },
      apply(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)!
        return { updatedList: ctx.allocationList.filter(r => r.rowId !== rowId), label: `兼務出向受入解除: ${personName(row)}` }
      },
    }
  },
}

// ── 兼務出向受入取消（セッション内追加分） ────────────────────────────────────

export const concurrentSecondmentInCancelDef: EditOperation = {
  id: 'ConcurrentSecondmentInCancel', label: '兼務出向受入取消',
  group: 'secondmentConcurrent', badge: 'negative',
  description: 'このセッションで追加した兼務出向受入を取消します。下記の情報が削除されます。',
  suppressSideEffectWarning: true,

  operationRole: { kind: 'lockCancel', of: 'ConcurrentSecondmentInNew' },

  availableFor(row) {
    if (row.concurrentType !== '兼務')   return unavailable('兼務行のみ対象です')
    if (!row.secondmentFromCompany)      return unavailable('出向受入が設定されていません')
    if (row.prevSecondmentFromCompany)   return unavailable('インポート前からの兼務出向受入は取消できません（出向受入解除を使用してください）')
    return AVAILABLE
  },

  inputs: [
    { field: 'lastName',                     required: false, readOnly: true },
    { field: 'firstName',                    required: false, readOnly: true },
    { field: 'secondmentFromCompany',        required: false, readOnly: true, label: '出向元会社' },
    { field: 'secondmentFromEmployeeNumber', required: false, readOnly: true, label: '出向元社員番号' },
    { field: 'departmentCode',               required: false, readOnly: true, label: '受入先組織コード' },
    { field: 'concurrentReason',             required: false, readOnly: true },
  ],

  onOpen: (row) => ({
    lastName:                     row.lastName,
    firstName:                    row.firstName,
    secondmentFromCompany:        row.secondmentFromCompany,
    secondmentFromEmployeeNumber: row.secondmentFromEmployeeNumber,
    departmentCode:               row.departmentCode,
    concurrentReason:             row.concurrentReason,
  }),

  createCommand(rowId) {
    return {
      kind: 'ConcurrentSecondmentInCancel',
      validate(ctx) {
        if (!ctx.allocationList.find(r => r.rowId === rowId)) return fail(`行が見つかりません (rowId: ${rowId})`)
        return ok()
      },
      apply(ctx) {
        const row  = ctx.allocationList.find(r => r.rowId === rowId)!
        const name = personName(row)
        if (getDirectSubordinates(row, ctx.allocationList).length > 0) {
          return {
            updatedList: ctx.allocationList.map(r => r.rowId === rowId ? vacatePosition(r) : r),
            label: `兼務出向受入取消（空席化）: ${name}`,
          }
        }
        return { updatedList: ctx.allocationList.filter(r => r.rowId !== rowId), label: `兼務出向受入取消: ${name}` }
      },
    }
  },
}

export const DEFS: EditOperation[] = [
  concurrentSecondmentOutNonSFDef,
  concurrentSecondmentInNewDef,
  concurrentSecondmentOutReleaseSFDef,    concurrentSecondmentOutReleaseNonSFDef,
  concurrentSecondmentInReleaseSFDef,     concurrentSecondmentInReleaseNonSFDef,
  concurrentSecondmentInCancelDef,
]
