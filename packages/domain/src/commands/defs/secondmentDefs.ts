// 出向操作 — 本務出向/受入・兼務出向/受入・それぞれの解除（SF統合・非統合）
import type { EditOperation } from './types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding, nextRowId } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'
import { isRegularEmployee, isSecondmentAcceptance, wasSecondedOut, wasSecondedIn, isMainAssignment, prevWasSecondmentIn, isSFIntegratedCompany } from '../helpers'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── 本務出向（SF統合先） ──────────────────────────────────────────────────────

export const secondmentOutSFDef: EditOperation = {
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

  validate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)                      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId)               return fail('人が配属されていない行に本務出向を設定できません')
    if (row.concurrentType === '兼務') return fail('兼務行には本務出向を設定できません')
    if (!values.secondmentToCompany) return fail('出向先会社は必須です')
    if (!values.departmentCode)      return fail('出向先組織コードは必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const orgSub = deriveOrgSubFields(values.departmentCode as string, ctx.codeLists)
    const fields = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId ? { ...r, ...fields, ...orgSub } : r
      ),
      label: `本務出向: ${personName(row)} → ${values.secondmentToCompany as string}`,
    }
  },
}

// ── 本務出向（SF非統合先） ────────────────────────────────────────────────────

export const secondmentOutNonSFDef: EditOperation = {
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

  validate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)                      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId)               return fail('人が配属されていない行に本務出向を設定できません')
    if (row.concurrentType === '兼務') return fail('兼務行には本務出向を設定できません')
    if (!values.secondmentToCompany) return fail('出向先会社は必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = (values.departmentCode as string | undefined) ?? ''
    const orgSub = deptCode ? deriveOrgSubFields(deptCode, ctx.codeLists) : {}
    const fields = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId ? { ...r, ...fields, ...orgSub } : r
      ),
      label: `本務出向: ${personName(row)} → ${values.secondmentToCompany as string}`,
    }
  },
}

// ── 本務出向受入（SF統合先） ──────────────────────────────────────────────────

export const secondmentInSFDef: EditOperation = {
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

  validate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.secondmentFromCompany) return fail('出向元会社は必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string | undefined
    const orgSub = deptCode ? deriveOrgSubFields(deptCode, ctx.codeLists) : {}
    const fields = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId ? { ...r, ...fields, ...orgSub } : r
      ),
      label: `本務出向受入: ${personName(row)} ← ${values.secondmentFromCompany as string ?? ''}`,
    }
  },
}

// ── 本務出向受入（SF非統合先） ────────────────────────────────────────────────

export const secondmentInNonSFDef: EditOperation = {
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

  validate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.secondmentFromCompany) return fail('出向元会社は必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string | undefined
    const orgSub = deptCode ? deriveOrgSubFields(deptCode, ctx.codeLists) : {}
    const fields = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId ? { ...r, ...fields, ...orgSub } : r
      ),
      label: `本務出向受入: ${personName(row)} ← ${values.secondmentFromCompany as string ?? ''}`,
    }
  },
}

// ── 兼務出向（SF統合先） ──────────────────────────────────────────────────────

export const concurrentSecondmentOutSFDef: EditOperation = {
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

  validate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId) return fail('人が配属されていない行に兼務出向を追加できません')
    if (row.concurrentType === '兼務') return fail('兼務行には兼務出向を追加できません')
    if (!values.secondmentToCompany) return fail('出向先会社は必須です')
    if (!values.departmentCode)      return fail('出向先組織コードは必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const src = ctx.allocationList.find(r => r.rowId === rowId)!
    const newRowId = nextRowId(ctx.allocationList)
    const posClears   = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const allocClears = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
    const orgSub = deriveOrgSubFields(values.departmentCode as string, ctx.codeLists)

    const newRow: AllocationRow = {
      ...src,
      ...posClears,
      ...allocClears,
      ...orgSub,
      rowId:                   newRowId,
      positionCode:            `_pos_${newRowId}`,
      departmentCode:          values.departmentCode as string,
      concurrentType:          '兼務',
      concurrentReason:        values.concurrentReason as string | undefined,
      secondmentToCompany:     values.secondmentToCompany as string,
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

// ── 兼務出向（SF非統合先） ────────────────────────────────────────────────────

export const concurrentSecondmentOutNonSFDef: EditOperation = {
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

  validate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId) return fail('人が配属されていない行に兼務出向を追加できません')
    if (row.concurrentType === '兼務') return fail('兼務行には兼務出向を追加できません')
    if (!values.secondmentToCompany) return fail('出向先会社は必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const src = ctx.allocationList.find(r => r.rowId === rowId)!
    const newRowId = nextRowId(ctx.allocationList)
    const posClears   = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const allocClears = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
    const deptCode = (values.departmentCode as string | undefined) ?? ''
    const orgSub = deptCode ? deriveOrgSubFields(deptCode, ctx.codeLists) : {}

    const newRow: AllocationRow = {
      ...src,
      ...posClears,
      ...allocClears,
      ...orgSub,
      rowId:                   newRowId,
      positionCode:            `_pos_${newRowId}`,
      departmentCode:          deptCode,
      concurrentType:          '兼務',
      concurrentReason:        values.concurrentReason as string | undefined,
      secondmentToCompany:     values.secondmentToCompany as string,
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

// ── 兼務出向受入（SF統合先） ──────────────────────────────────────────────────

export const concurrentSecondmentInSFDef: EditOperation = {
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

  validate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId) return fail('人が配属されていない行に兼務出向受入を追加できません')
    if (row.concurrentType === '兼務') return fail('兼務行には兼務出向受入を追加できません')
    if (!values.secondmentFromCompany) return fail('出向元会社は必須です')
    if (!values.departmentCode)        return fail('受入先組織コードは必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const src = ctx.allocationList.find(r => r.rowId === rowId)!
    const newRowId = nextRowId(ctx.allocationList)
    const posClears   = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const allocClears = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
    const orgSub = deriveOrgSubFields(values.departmentCode as string, ctx.codeLists)

    const newRow: AllocationRow = {
      ...src,
      ...posClears,
      ...allocClears,
      ...orgSub,
      rowId:                         newRowId,
      positionCode:                  `_pos_${newRowId}`,
      departmentCode:                values.departmentCode as string,
      concurrentType:                '兼務',
      concurrentReason:              values.concurrentReason as string | undefined,
      secondmentFromCompany:         values.secondmentFromCompany as string,
      secondmentFromEmployeeNumber:  values.secondmentFromEmployeeNumber as string | undefined,
      prevDepartmentCode:            undefined,
      prevPositionCode:              undefined,
      prevConcurrentType:            undefined,
      prevSecondmentFromCompany:     undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `兼務出向受入追加: ${personName(src)} ← ${values.secondmentFromCompany as string}`,
    }
  },
}

// ── 兼務出向受入（SF非統合先） ────────────────────────────────────────────────

export const concurrentSecondmentInNonSFDef: EditOperation = {
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

  validate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId) return fail('人が配属されていない行に兼務出向受入を追加できません')
    if (row.concurrentType === '兼務') return fail('兼務行には兼務出向受入を追加できません')
    if (!values.secondmentFromCompany) return fail('出向元会社は必須です')
    if (!values.departmentCode)        return fail('受入先組織コードは必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const src = ctx.allocationList.find(r => r.rowId === rowId)!
    const newRowId = nextRowId(ctx.allocationList)
    const posClears   = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const allocClears = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
    const orgSub = deriveOrgSubFields(values.departmentCode as string, ctx.codeLists)

    const newRow: AllocationRow = {
      ...src,
      ...posClears,
      ...allocClears,
      ...orgSub,
      rowId:                         newRowId,
      positionCode:                  `_pos_${newRowId}`,
      departmentCode:                values.departmentCode as string,
      concurrentType:                '兼務',
      concurrentReason:              values.concurrentReason as string | undefined,
      secondmentFromCompany:         values.secondmentFromCompany as string,
      secondmentFromEmployeeNumber:  values.secondmentFromEmployeeNumber as string | undefined,
      prevDepartmentCode:            undefined,
      prevPositionCode:              undefined,
      prevConcurrentType:            undefined,
      prevSecondmentFromCompany:     undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `兼務出向受入追加: ${personName(src)} ← ${values.secondmentFromCompany as string}`,
    }
  },
}

// ── 共通ヘルパー: 解除操作の inputs ─────────────────────────────────────────

const outReleaseInputs = [
  { field: 'employmentType' as const, required: true,  label: '戻り後の雇用タイプ' },
  { field: 'departmentCode' as const, required: false, label: '戻り先組織コード（任意）' },
  { field: 'transferReason' as const, required: false },
] as const

// ── 本務出向解除（SF導入先）──────────────────────────────────────────────────

export const secondmentOutReleaseSFDef: EditOperation = {
  id: 'SecondmentOutReleaseSF', label: '本務出向解除（SF導入先）',
  group: 'person', badgeColor: 'bg-red-100 text-red-600',
  availableFor: (row, cl) =>
    wasSecondedOut(row) && isMainAssignment(row) &&
    isSFIntegratedCompany(row.prevSecondmentToCompany as string | undefined, cl),
  inputs: [...outReleaseInputs],
  deriveInitial: (row) => ({ employmentType: row.prevEmploymentType as string | undefined }),

  validate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.prevSecondmentToCompany)
      return fail('出向先が設定されていないため出向解除できません')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string | undefined
    const orgSub = deptCode ? deriveOrgSubFields(deptCode, ctx.codeLists) : {}
    const fields = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? { ...r, ...fields, ...orgSub, secondmentToCompany: undefined }
          : r
      ),
      label: `本務出向解除: ${personName(row)}`,
    }
  },
}

// ── 本務出向解除（SF未導入先） ────────────────────────────────────────────────

export const secondmentOutReleaseNonSFDef: EditOperation = {
  id: 'SecondmentOutReleaseNonSF', label: '本務出向解除（SF未導入先）',
  group: 'person', badgeColor: 'bg-red-100 text-red-600',
  availableFor: (row, cl) =>
    wasSecondedOut(row) && isMainAssignment(row) &&
    !isSFIntegratedCompany(row.prevSecondmentToCompany as string | undefined, cl),
  inputs: [...outReleaseInputs],
  deriveInitial: (row) => ({ employmentType: row.prevEmploymentType as string | undefined }),

  validate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.prevSecondmentToCompany)
      return fail('出向先が設定されていないため出向解除できません')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string | undefined
    const orgSub = deptCode ? deriveOrgSubFields(deptCode, ctx.codeLists) : {}
    const fields = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? { ...r, ...fields, ...orgSub, secondmentToCompany: undefined }
          : r
      ),
      label: `本務出向解除: ${personName(row)}`,
    }
  },
}

// ── 共通: 出向受入解除 inputs / validate / apply ─────────────────────────────

const inReleaseInputs = [
  { field: 'transferReason' as const, required: true, label: '異動事由', readOnly: true as const },
  { field: 'memo'           as const, required: true, label: 'メモ' },
] as const

const inReleaseInitial = () => ({
  transferReason: '社内兼務解除、兼務出向解除、出向受入・兼務出向受入解除',
})

// ── 本務出向受入解除（SF導入先） ──────────────────────────────────────────────

export const secondmentInReleaseSFDef: EditOperation = {
  id: 'SecondmentInReleaseSF', label: '本務出向受入解除（SF導入先）',
  group: 'person', badgeColor: 'bg-red-100 text-red-600',
  availableFor: (row, cl) =>
    wasSecondedIn(row) && prevWasSecondmentIn(row, cl) &&
    isSFIntegratedCompany(row.prevSecondmentFromCompany as string | undefined, cl),
  inputs: [...inReleaseInputs],
  deriveInitial: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  validate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.prevSecondmentFromCompany)
      return fail('出向元が設定されていないため出向受入解除できません')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? {
              ...r,
              transferReason:               values.transferReason,
              secondmentFromCompany:        undefined,
              secondmentFromEmployeeNumber: undefined,
            }
          : r
      ),
      label: `本務出向受入解除: ${personName(row)}`,
    }
  },
}

// ── 本務出向受入解除（SF未導入先） ────────────────────────────────────────────

export const secondmentInReleaseNonSFDef: EditOperation = {
  id: 'SecondmentInReleaseNonSF', label: '本務出向受入解除（SF未導入先）',
  group: 'person', badgeColor: 'bg-red-100 text-red-600',
  availableFor: (row, cl) =>
    wasSecondedIn(row) && prevWasSecondmentIn(row, cl) &&
    !isSFIntegratedCompany(row.prevSecondmentFromCompany as string | undefined, cl),
  inputs: [...inReleaseInputs],
  deriveInitial: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  validate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.prevSecondmentFromCompany)
      return fail('出向元が設定されていないため出向受入解除できません')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? {
              ...r,
              transferReason:               values.transferReason,
              secondmentFromCompany:        undefined,
              secondmentFromEmployeeNumber: undefined,
            }
          : r
      ),
      label: `本務出向受入解除: ${personName(row)}`,
    }
  },
}

// ── 兼務出向解除（SF導入先） ──────────────────────────────────────────────────

export const concurrentSecondmentOutReleaseSFDef: EditOperation = {
  id: 'ConcurrentSecondmentOutReleaseSF', label: '兼務出向解除（SF導入先）',
  group: 'person', badgeColor: 'bg-red-50 text-red-500',
  availableFor: (row, cl) =>
    row.concurrentType === '兼務' && !!row.secondmentToCompany &&
    isSFIntegratedCompany(row.secondmentToCompany as string | undefined, cl),
  inputs: [...inReleaseInputs],
  deriveInitial: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  validate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentToCompany)
      return fail('兼務出向行ではありません（concurrentType=兼務 かつ secondmentToCompany が必要）')
    return ok()
  },

  apply(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== rowId),
      label: `兼務出向解除: ${personName(row)}`,
    }
  },
}

// ── 兼務出向解除（SF未導入先） ────────────────────────────────────────────────

export const concurrentSecondmentOutReleaseNonSFDef: EditOperation = {
  id: 'ConcurrentSecondmentOutReleaseNonSF', label: '兼務出向解除（SF未導入先）',
  group: 'person', badgeColor: 'bg-red-50 text-red-500',
  availableFor: (row, cl) =>
    row.concurrentType === '兼務' && !!row.secondmentToCompany &&
    !isSFIntegratedCompany(row.secondmentToCompany as string | undefined, cl),
  inputs: [...inReleaseInputs],
  deriveInitial: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  validate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentToCompany)
      return fail('兼務出向行ではありません（concurrentType=兼務 かつ secondmentToCompany が必要）')
    return ok()
  },

  apply(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== rowId),
      label: `兼務出向解除: ${personName(row)}`,
    }
  },
}

// ── 兼務出向受入解除（SF導入先） ──────────────────────────────────────────────

export const concurrentSecondmentInReleaseSFDef: EditOperation = {
  id: 'ConcurrentSecondmentInReleaseSF', label: '兼務出向受入解除（SF導入先）',
  group: 'person', badgeColor: 'bg-red-50 text-red-500',
  availableFor: (row, cl) =>
    row.concurrentType === '兼務' && !!row.secondmentFromCompany &&
    isSFIntegratedCompany(row.secondmentFromCompany as string | undefined, cl),
  inputs: [...inReleaseInputs],
  deriveInitial: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  validate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentFromCompany)
      return fail('兼務出向受入行ではありません（concurrentType=兼務 かつ secondmentFromCompany が必要）')
    return ok()
  },

  apply(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== rowId),
      label: `兼務出向受入解除: ${personName(row)}`,
    }
  },
}

// ── 兼務出向受入解除（SF未導入先） ────────────────────────────────────────────

export const concurrentSecondmentInReleaseNonSFDef: EditOperation = {
  id: 'ConcurrentSecondmentInReleaseNonSF',
  label: '兼務出向受入解除（SF未導入先）',
  group: 'person', badgeColor: 'bg-red-50 text-red-500',
  availableFor: (row, cl) =>
    row.concurrentType === '兼務' && !!row.secondmentFromCompany &&
    !isSFIntegratedCompany(row.secondmentFromCompany as string | undefined, cl),
  inputs: [...inReleaseInputs],
  deriveInitial: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  validate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentFromCompany)
      return fail('兼務出向受入行ではありません（concurrentType=兼務 かつ secondmentFromCompany が必要）')
    return ok()
  },

  apply(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== rowId),
      label: `兼務出向受入解除: ${personName(row)}`,
    }
  },
}

export const DEFS: EditOperation[] = [
  secondmentOutSFDef,              secondmentOutNonSFDef,
  secondmentInSFDef,               secondmentInNonSFDef,
  concurrentSecondmentOutSFDef,    concurrentSecondmentOutNonSFDef,
  concurrentSecondmentInSFDef,     concurrentSecondmentInNonSFDef,
  secondmentOutReleaseSFDef,       secondmentOutReleaseNonSFDef,
  secondmentInReleaseSFDef,        secondmentInReleaseNonSFDef,
  concurrentSecondmentOutReleaseSFDef, concurrentSecondmentOutReleaseNonSFDef,
  concurrentSecondmentInReleaseSFDef,  concurrentSecondmentInReleaseNonSFDef,
]
