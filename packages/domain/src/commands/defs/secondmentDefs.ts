// 出向操作 — 本務出向/受入・兼務出向/受入・それぞれの解除（SF統合・非統合）
import type { EditOperation } from './types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding, nextRowId } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'
import { isRegularEmployee, isSecondmentAcceptance, wasSecondedOut, wasSecondedIn, isMainAssignment, prevWasSecondmentIn, isSFIntegratedCompany } from '../helpers'
import type { AllMasters } from '../../masters/aggregate'
import { TR } from '../../transferReasonLabels'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── 本務出向（SF統合先） ──────────────────────────────────────────────────────

export const secondmentOutSFDef: EditOperation = {
  id:         'SecondmentOutSF',
  label:      '本務出向（SF統合先）',
  group:      'person',
  badge: 'secondment',

  operationRole: {
    kind:                'lock',
    isActive:            (row) => !!(row.secondmentToCompany as string | undefined),
    isActiveThisSession: (row) => !!(row.secondmentToCompany as string | undefined) && !(row.prevSecondmentToCompany as string | undefined),
  },

  availableFor: (row, ms) =>
    isRegularEmployee(row, ms) && isMainAssignment(row) && !wasSecondedOut(row),

  inputs: [
    { field: 'transferReason',      required: true  },
    { field: 'secondmentToCompany', required: true,  label: '出向先会社（SF統合）' },
    { field: 'departmentCode',      required: true,  label: '出向先組織コード' },
    { field: 'employmentType',      required: true,  label: '雇用タイプ（出向）' },
    { field: 'memo',                required: false },
  ],

  onOpen: (row) => ({
    transferReason: row.transferReason as string | undefined,
    memo:           row.memo           as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)                      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId)               return fail('人が配属されていない行に本務出向を設定できません')
    if (row.concurrentType === '兼務') return fail('兼務行には本務出向を設定できません')
    if (!values.secondmentToCompany) return fail('出向先会社は必須です')
    if (!values.departmentCode)      return fail('出向先組織コードは必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const orgSub = deriveOrgSubFields(values.departmentCode as string, ctx.masters)
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
  badge: 'secondment',

  operationRole: {
    kind:                'lock',
    isActive:            (row) => !!(row.secondmentToCompany as string | undefined),
    isActiveThisSession: (row) => !!(row.secondmentToCompany as string | undefined) && !(row.prevSecondmentToCompany as string | undefined),
  },

  availableFor: (row, ms) =>
    isRegularEmployee(row, ms) && isMainAssignment(row) && !wasSecondedOut(row),

  inputs: [
    { field: 'transferReason',      required: true  },
    { field: 'secondmentToCompany', required: true,  label: '出向先会社（SF非統合）' },
    { field: 'departmentCode',      required: false, label: '出向先組織コード（任意）' },
    { field: 'employmentType',      required: true,  label: '雇用タイプ（出向）' },
    { field: 'memo',                required: false },
  ],

  onOpen: (row) => ({
    transferReason: row.transferReason as string | undefined,
    memo:           row.memo           as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)                      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId)               return fail('人が配属されていない行に本務出向を設定できません')
    if (row.concurrentType === '兼務') return fail('兼務行には本務出向を設定できません')
    if (!values.secondmentToCompany) return fail('出向先会社は必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = (values.departmentCode as string | undefined) ?? ''
    const orgSub = deptCode ? deriveOrgSubFields(deptCode, ctx.masters) : {}
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
  badge: 'secondment',

  operationRole: {
    kind:                'lock',
    isActive:            (row) => !!(row.secondmentFromCompany as string | undefined),
    isActiveThisSession: (row) => !!(row.secondmentFromCompany as string | undefined) && !(row.prevSecondmentFromCompany as string | undefined),
  },

  availableFor: (row, ms) =>
    !isSecondmentAcceptance(row, ms) && isMainAssignment(row) && !wasSecondedIn(row),

  inputs: [
    { field: 'transferReason',               required: false },
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社（SF統合）' },
    { field: 'secondmentFromEmployeeNumber', required: true,  label: '出向元社員番号' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード' },
    { field: 'employmentType',               required: true,  label: '雇用タイプ（出向受入）' },
    { field: 'memo',                         required: false },
  ],

  onOpen: (row) => ({
    transferReason: row.transferReason as string | undefined,
    memo:           row.memo           as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.secondmentFromCompany) return fail('出向元会社は必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string | undefined
    const orgSub = deptCode ? deriveOrgSubFields(deptCode, ctx.masters) : {}
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
  badge: 'secondment',

  operationRole: {
    kind:                'lock',
    isActive:            (row) => !!(row.secondmentFromCompany as string | undefined),
    isActiveThisSession: (row) => !!(row.secondmentFromCompany as string | undefined) && !(row.prevSecondmentFromCompany as string | undefined),
  },

  availableFor: (row, ms) =>
    !isSecondmentAcceptance(row, ms) && isMainAssignment(row) && !wasSecondedIn(row),

  inputs: [
    { field: 'transferReason',               required: false },
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社（SF非統合）' },
    { field: 'secondmentFromEmployeeNumber', required: false, label: '出向元社員番号（任意）' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード' },
    { field: 'employmentType',               required: true,  label: '雇用タイプ（出向受入）' },
    { field: 'memo',                         required: false },
  ],

  onOpen: (row) => ({
    transferReason: row.transferReason as string | undefined,
    memo:           row.memo           as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.secondmentFromCompany) return fail('出向元会社は必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string | undefined
    const orgSub = deptCode ? deriveOrgSubFields(deptCode, ctx.masters) : {}
    const fields = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId ? { ...r, ...fields, ...orgSub } : r
      ),
      label: `本務出向受入: ${personName(row)} ← ${values.secondmentFromCompany as string ?? ''}`,
    }
  },
}

// ── 本務出向受入 新規（SF統合先：組織ボタンから） ──────────────────────────────

export const secondmentInNewSFDef: EditOperation = {
  id:         'SecondmentInNewSF',
  label:      '本務出向受入 新規（SF）',
  group:      'person',
  badge: 'secondment',

  availableFor: () => false, // 組織パネルボタンからのみ起動

  inputs: [
    { field: 'transferReason',               required: false },
    { field: 'lastName',                     required: true  },
    { field: 'firstName',                    required: true  },
    { field: 'groupEmployeeId',              required: false },
    { field: 'employeeNumber',               required: false },
    { field: 'userId',                       required: false },
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社（SF統合）' },
    { field: 'secondmentFromEmployeeNumber', required: true,  label: '出向元社員番号' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード', picker: 'org' },
    { field: 'employmentType',               required: false, label: '雇用タイプ（出向受入）' },
    { field: 'positionBand',                 required: false },
    { field: 'band',                         required: false },
    { field: 'payGrade',                     required: false },
    { field: 'memo',                         required: false },
  ],

  onOpen: (row) => ({ departmentCode: row.departmentCode }),

  onValidate(_ctx, _rowId, values) {
    if (!values.lastName)                     return fail('姓は必須です')
    if (!values.firstName)                    return fail('名は必須です')
    if (!values.secondmentFromCompany)        return fail('出向元会社は必須です')
    if (!values.secondmentFromEmployeeNumber) return fail('出向元社員番号は必須です')
    if (!values.departmentCode)               return fail('受入先組織コードは必須です')
    return ok()
  },

  onSubmit(ctx, _rowId, values) {
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
      trainingPositionFlag: '0',
      userId:               (values.userId as string | undefined) || undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `本務出向受入（新規）: ${name} ← ${values.secondmentFromCompany as string ?? ''}`,
    }
  },
}

// ── 本務出向受入 新規（SF非統合先：組織ボタンから） ────────────────────────────

export const secondmentInNewNonSFDef: EditOperation = {
  id:         'SecondmentInNewNonSF',
  label:      '本務出向受入 新規（非SF）',
  group:      'person',
  badge: 'secondment',

  availableFor: () => false,

  inputs: [
    { field: 'transferReason',               required: false },
    { field: 'lastName',                     required: true  },
    { field: 'firstName',                    required: true  },
    { field: 'groupEmployeeId',              required: false },
    { field: 'employeeNumber',               required: false },
    { field: 'userId',                       required: false },
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社（SF非統合）' },
    { field: 'secondmentFromEmployeeNumber', required: false, label: '出向元社員番号（任意）' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード', picker: 'org' },
    { field: 'employmentType',               required: false, label: '雇用タイプ（出向受入）' },
    { field: 'positionBand',                 required: false },
    { field: 'band',                         required: false },
    { field: 'payGrade',                     required: false },
    { field: 'memo',                         required: false },
  ],

  onOpen: (row) => ({ departmentCode: row.departmentCode }),

  onValidate(_ctx, _rowId, values) {
    if (!values.lastName)              return fail('姓は必須です')
    if (!values.firstName)             return fail('名は必須です')
    if (!values.secondmentFromCompany) return fail('出向元会社は必須です')
    if (!values.departmentCode)        return fail('受入先組織コードは必須です')
    return ok()
  },

  onSubmit(ctx, _rowId, values) {
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
      trainingPositionFlag: '0',
      userId:               (values.userId as string | undefined) || undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `本務出向受入（新規）: ${name} ← ${values.secondmentFromCompany as string ?? ''}`,
    }
  },
}

// ── 兼務出向受入 新規（SF統合先：組織ボタンから） ──────────────────────────────

export const concurrentSecondmentInNewSFDef: EditOperation = {
  id:         'ConcurrentSecondmentInNewSF',
  label:      '兼務出向受入 新規（SF）',
  group:      'person',
  badge: 'secondment',

  availableFor: () => false,

  inputs: [
    { field: 'transferReason',               required: false },
    { field: 'lastName',                     required: true  },
    { field: 'firstName',                    required: true  },
    { field: 'groupEmployeeId',              required: false },
    { field: 'employeeNumber',               required: false },
    { field: 'userId',                       required: false },
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社（SF統合）' },
    { field: 'secondmentFromEmployeeNumber', required: true,  label: '出向元社員番号' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード', picker: 'org' },
    { field: 'employmentType',               required: false, label: '雇用タイプ（出向受入）' },
    { field: 'positionBand',                 required: false },
    { field: 'band',                         required: false },
    { field: 'payGrade',                     required: false },
    { field: 'concurrentReason',             required: false },
    { field: 'memo',                         required: false },
  ],

  onOpen: (row) => ({ departmentCode: row.departmentCode }),

  onValidate(_ctx, _rowId, values) {
    if (!values.lastName)                     return fail('姓は必須です')
    if (!values.firstName)                    return fail('名は必須です')
    if (!values.secondmentFromCompany)        return fail('出向元会社は必須です')
    if (!values.secondmentFromEmployeeNumber) return fail('出向元社員番号は必須です')
    if (!values.departmentCode)               return fail('受入先組織コードは必須です')
    return ok()
  },

  onSubmit(ctx, _rowId, values) {
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
      trainingPositionFlag: '0',
      userId:               (values.userId as string | undefined) || undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `兼務出向受入（新規）: ${name} ← ${values.secondmentFromCompany as string ?? ''}`,
    }
  },
}

// ── 兼務出向受入 新規（SF非統合先：組織ボタンから） ────────────────────────────

export const concurrentSecondmentInNewNonSFDef: EditOperation = {
  id:         'ConcurrentSecondmentInNewNonSF',
  label:      '兼務出向受入 新規（非SF）',
  group:      'person',
  badge: 'secondment',

  availableFor: () => false,

  inputs: [
    { field: 'transferReason',               required: false },
    { field: 'lastName',                     required: true  },
    { field: 'firstName',                    required: true  },
    { field: 'groupEmployeeId',              required: false },
    { field: 'employeeNumber',               required: false },
    { field: 'userId',                       required: false },
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社（SF非統合）' },
    { field: 'secondmentFromEmployeeNumber', required: false, label: '出向元社員番号（任意）' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード', picker: 'org' },
    { field: 'employmentType',               required: false, label: '雇用タイプ（出向受入）' },
    { field: 'positionBand',                 required: false },
    { field: 'band',                         required: false },
    { field: 'payGrade',                     required: false },
    { field: 'concurrentReason',             required: false },
    { field: 'memo',                         required: false },
  ],

  onOpen: (row) => ({ departmentCode: row.departmentCode }),

  onValidate(_ctx, _rowId, values) {
    if (!values.lastName)              return fail('姓は必須です')
    if (!values.firstName)             return fail('名は必須です')
    if (!values.secondmentFromCompany) return fail('出向元会社は必須です')
    if (!values.departmentCode)        return fail('受入先組織コードは必須です')
    return ok()
  },

  onSubmit(ctx, _rowId, values) {
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
      trainingPositionFlag: '0',
      userId:               (values.userId as string | undefined) || undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `兼務出向受入（新規）: ${name} ← ${values.secondmentFromCompany as string ?? ''}`,
    }
  },
}

// ── 兼務出向（SF統合先） ──────────────────────────────────────────────────────

export const concurrentSecondmentOutSFDef: EditOperation = {
  id:         'ConcurrentSecondmentOutSF',
  label:      '兼務出向（SF統合先）',
  group:      'person',
  badge: 'secondment',

  availableFor: (row, ms) =>
    isRegularEmployee(row, ms) && isMainAssignment(row),

  inputs: [
    { field: 'transferReason',      required: false },
    { field: 'secondmentToCompany', required: true,  label: '出向先会社（SF統合）' },
    { field: 'departmentCode',      required: true,  label: '出向先組織コード' },
    { field: 'concurrentReason',    required: false },
    { field: 'memo',                required: false },
  ],

  onOpen: (row) => ({
    transferReason: row.transferReason as string | undefined,
    memo:           row.memo           as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId) return fail('人が配属されていない行に兼務出向を追加できません')
    if (row.concurrentType === '兼務') return fail('兼務行には兼務出向を追加できません')
    if (!values.secondmentToCompany) return fail('出向先会社は必須です')
    if (!values.departmentCode)      return fail('出向先組織コードは必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const src = ctx.allocationList.find(r => r.rowId === rowId)!
    const newRowId = nextRowId(ctx.allocationList)
    const posClears   = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const orgSub = deriveOrgSubFields(values.departmentCode as string, ctx.masters)

    const newRow: AllocationRow = {
      ...src,
      ...posClears,
      ...orgSub,
      rowId:                   newRowId,
      positionCode:            `_pos_${newRowId}`,
      departmentCode:          values.departmentCode as string,
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

// ── 兼務出向（SF非統合先） ────────────────────────────────────────────────────

export const concurrentSecondmentOutNonSFDef: EditOperation = {
  id:         'ConcurrentSecondmentOutNonSF',
  label:      '兼務出向（SF非統合先）',
  group:      'person',
  badge: 'secondment',

  availableFor: (row, ms) =>
    isRegularEmployee(row, ms) && isMainAssignment(row),

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

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId) return fail('人が配属されていない行に兼務出向を追加できません')
    if (row.concurrentType === '兼務') return fail('兼務行には兼務出向を追加できません')
    if (!values.secondmentToCompany) return fail('出向先会社は必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const src = ctx.allocationList.find(r => r.rowId === rowId)!
    const newRowId = nextRowId(ctx.allocationList)
    const posClears   = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const deptCode = (values.departmentCode as string | undefined) ?? ''
    const orgSub = deptCode ? deriveOrgSubFields(deptCode, ctx.masters) : {}

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

// ── 兼務出向受入（SF統合先） ──────────────────────────────────────────────────

export const concurrentSecondmentInSFDef: EditOperation = {
  id:         'ConcurrentSecondmentInSF',
  label:      '兼務出向受入（SF統合先）',
  group:      'person',
  badge: 'secondment',

  availableFor: (row) => isMainAssignment(row),

  inputs: [
    { field: 'transferReason',               required: false },
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社（SF統合）' },
    { field: 'secondmentFromEmployeeNumber', required: true,  label: '出向元社員番号' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード' },
    { field: 'concurrentReason',             required: false },
    { field: 'memo',                         required: false },
  ],

  onOpen: (row) => ({
    transferReason: row.transferReason as string | undefined,
    memo:           row.memo           as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId) return fail('人が配属されていない行に兼務出向受入を追加できません')
    if (row.concurrentType === '兼務') return fail('兼務行には兼務出向受入を追加できません')
    if (!values.secondmentFromCompany) return fail('出向元会社は必須です')
    if (!values.departmentCode)        return fail('受入先組織コードは必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const src = ctx.allocationList.find(r => r.rowId === rowId)!
    const newRowId = nextRowId(ctx.allocationList)
    const posClears   = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const orgSub = deriveOrgSubFields(values.departmentCode as string, ctx.masters)

    const newRow: AllocationRow = {
      ...src,
      ...posClears,
      ...orgSub,
      rowId:                         newRowId,
      positionCode:                  `_pos_${newRowId}`,
      departmentCode:                values.departmentCode as string,
      concurrentType:                '兼務',
      concurrentReason:              values.concurrentReason as string | undefined,
      secondmentFromCompany:         values.secondmentFromCompany as string,
      secondmentFromEmployeeNumber:  values.secondmentFromEmployeeNumber as string | undefined,
      memo:                          values.memo as string | undefined,
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
  badge: 'secondment',

  availableFor: (row) => isMainAssignment(row),

  inputs: [
    { field: 'transferReason',               required: false },
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社（SF非統合）' },
    { field: 'secondmentFromEmployeeNumber', required: false, label: '出向元社員番号（任意）' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード' },
    { field: 'concurrentReason',             required: false },
    { field: 'memo',                         required: false },
  ],

  onOpen: (row) => ({
    transferReason: row.transferReason as string | undefined,
    memo:           row.memo           as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId) return fail('人が配属されていない行に兼務出向受入を追加できません')
    if (row.concurrentType === '兼務') return fail('兼務行には兼務出向受入を追加できません')
    if (!values.secondmentFromCompany) return fail('出向元会社は必須です')
    if (!values.departmentCode)        return fail('受入先組織コードは必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const src = ctx.allocationList.find(r => r.rowId === rowId)!
    const newRowId = nextRowId(ctx.allocationList)
    const posClears   = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const orgSub = deriveOrgSubFields(values.departmentCode as string, ctx.masters)

    const newRow: AllocationRow = {
      ...src,
      ...posClears,
      ...orgSub,
      rowId:                         newRowId,
      positionCode:                  `_pos_${newRowId}`,
      departmentCode:                values.departmentCode as string,
      concurrentType:                '兼務',
      concurrentReason:              values.concurrentReason as string | undefined,
      secondmentFromCompany:         values.secondmentFromCompany as string,
      secondmentFromEmployeeNumber:  values.secondmentFromEmployeeNumber as string | undefined,
      memo:                          values.memo as string | undefined,
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
  { field: 'transferReason' as const, required: false },
  { field: 'employmentType' as const, required: true,  label: '戻り後の雇用タイプ' },
  { field: 'departmentCode' as const, required: false, label: '戻り先組織コード（任意）' },
  { field: 'memo'           as const, required: false },
] as const

// ── 本務出向解除（SF導入先）──────────────────────────────────────────────────

export const secondmentOutReleaseSFDef: EditOperation = {
  id: 'SecondmentOutReleaseSF', label: '本務出向解除（SF導入先）',
  group: 'person', badge: 'negative',
  availableFor: (row, ms) =>
    wasSecondedOut(row) && isMainAssignment(row) &&
    isSFIntegratedCompany(row.prevSecondmentToCompany as string | undefined, ms),
  inputs: [...outReleaseInputs],
  onOpen: (row) => ({
    transferReason: row.transferReason      as string | undefined,
    employmentType: row.prevEmploymentType  as string | undefined,
    memo:           row.memo               as string | undefined,
  }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.prevSecondmentToCompany)
      return fail('出向先が設定されていないため出向解除できません')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string | undefined
    const orgSub = deptCode ? deriveOrgSubFields(deptCode, ctx.masters) : {}
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
  group: 'person', badge: 'negative',
  availableFor: (row, ms) =>
    wasSecondedOut(row) && isMainAssignment(row) &&
    !isSFIntegratedCompany(row.prevSecondmentToCompany as string | undefined, ms),
  inputs: [...outReleaseInputs],
  onOpen: (row) => ({
    transferReason: row.transferReason      as string | undefined,
    employmentType: row.prevEmploymentType  as string | undefined,
    memo:           row.memo               as string | undefined,
  }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.prevSecondmentToCompany)
      return fail('出向先が設定されていないため出向解除できません')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string | undefined
    const orgSub = deptCode ? deriveOrgSubFields(deptCode, ctx.masters) : {}
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
  transferReason: TR.CONCURRENT_OR_SECONDMENT_IN_RELEASE,
})

// ── 本務出向受入解除（SF導入先） ──────────────────────────────────────────────

export const secondmentInReleaseSFDef: EditOperation = {
  id: 'SecondmentInReleaseSF', label: '本務出向受入解除（SF導入先）',
  group: 'person', badge: 'negative',
  availableFor: (row, ms) =>
    wasSecondedIn(row) && prevWasSecondmentIn(row, ms) &&
    isSFIntegratedCompany(row.prevSecondmentFromCompany as string | undefined, ms),
  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.prevSecondmentFromCompany)
      return fail('出向元が設定されていないため出向受入解除できません')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
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
  group: 'person', badge: 'negative',
  availableFor: (row, ms) =>
    wasSecondedIn(row) && prevWasSecondmentIn(row, ms) &&
    !isSFIntegratedCompany(row.prevSecondmentFromCompany as string | undefined, ms),
  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.prevSecondmentFromCompany)
      return fail('出向元が設定されていないため出向受入解除できません')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
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
  group: 'person', badge: 'negative',
  availableFor: (row, ms) =>
    row.concurrentType === '兼務' && !!row.secondmentToCompany &&
    isSFIntegratedCompany(row.secondmentToCompany as string | undefined, ms),
  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentToCompany)
      return fail('兼務出向行ではありません（concurrentType=兼務 かつ secondmentToCompany が必要）')
    return ok()
  },

  onSubmit(ctx, rowId, _values) {
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
  group: 'person', badge: 'negative',
  availableFor: (row, ms) =>
    row.concurrentType === '兼務' && !!row.secondmentToCompany &&
    !isSFIntegratedCompany(row.secondmentToCompany as string | undefined, ms),
  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentToCompany)
      return fail('兼務出向行ではありません（concurrentType=兼務 かつ secondmentToCompany が必要）')
    return ok()
  },

  onSubmit(ctx, rowId, _values) {
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
  group: 'person', badge: 'negative',
  availableFor: (row, ms) =>
    row.concurrentType === '兼務' && !!row.secondmentFromCompany &&
    isSFIntegratedCompany(row.secondmentFromCompany as string | undefined, ms),
  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentFromCompany)
      return fail('兼務出向受入行ではありません（concurrentType=兼務 かつ secondmentFromCompany が必要）')
    return ok()
  },

  onSubmit(ctx, rowId, _values) {
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
  group: 'person', badge: 'negative',
  availableFor: (row, ms) =>
    row.concurrentType === '兼務' && !!row.secondmentFromCompany &&
    !isSFIntegratedCompany(row.secondmentFromCompany as string | undefined, ms),
  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentFromCompany)
      return fail('兼務出向受入行ではありません（concurrentType=兼務 かつ secondmentFromCompany が必要）')
    return ok()
  },

  onSubmit(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== rowId),
      label: `兼務出向受入解除: ${personName(row)}`,
    }
  },
}

// ── 出向受入取消（セッション内追加分・SF別） ────────────────────────────────────
// createSecondmentInRow で追加した行を削除する（prevSecondmentFromCompany が空 = このセッションで追加）
// SF/非SF 別に分けることで SummaryView の対応セクションに配置できる

const isCancelAvailableSF = (row: AllocationRow, ms: AllMasters) =>
  !!row.secondmentFromCompany && !row.prevSecondmentFromCompany &&
  isSFIntegratedCompany(row.secondmentFromCompany as string, ms)

const isCancelAvailableNonSF = (row: AllocationRow, ms: AllMasters) =>
  !!row.secondmentFromCompany && !row.prevSecondmentFromCompany &&
  !isSFIntegratedCompany(row.secondmentFromCompany as string, ms)

const cancelDescription = 'このセッションで追加した出向受入を取消します。下記の情報が削除されます。'

export const secondmentInCancelSFDef: EditOperation = {
  id: 'SecondmentInCancelSF', label: '本務出向受入取消（SF導入先）',
  group: 'person', badge: 'negative',
  operationRole: { kind: 'lockCancel', of: 'SecondmentInSF' },
  availableFor: (row) => isMainAssignment(row),
  description: cancelDescription,
  suppressSideEffectWarning: true,
  inputs: [
    { field: 'lastName',                     required: false, readOnly: true },
    { field: 'firstName',                    required: false, readOnly: true },
    { field: 'secondmentFromCompany',        required: false, readOnly: true, label: '出向元会社（SF統合）' },
    { field: 'secondmentFromEmployeeNumber', required: false, readOnly: true, label: '出向元社員番号' },
    { field: 'departmentCode',               required: false, readOnly: true, label: '受入先組織コード' },
    { field: 'employmentType',               required: false, readOnly: true },
  ],
  onOpen: (row) => ({
    lastName:                     row.lastName,
    firstName:                    row.firstName,
    secondmentFromCompany:        row.secondmentFromCompany,
    secondmentFromEmployeeNumber: row.secondmentFromEmployeeNumber,
    departmentCode:               row.departmentCode,
    employmentType:               row.employmentType,
  }),
  onValidate(ctx, rowId) {
    if (!ctx.allocationList.find(r => r.rowId === rowId)) return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },
  onSubmit(ctx, rowId) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return { updatedList: ctx.allocationList.filter(r => r.rowId !== rowId), label: `本務出向受入取消: ${personName(row)}` }
  },
}

export const secondmentInCancelNonSFDef: EditOperation = {
  id: 'SecondmentInCancelNonSF', label: '本務出向受入取消（SF未導入先）',
  group: 'person', badge: 'negative',
  operationRole: { kind: 'lockCancel', of: 'SecondmentInNonSF' },
  availableFor: (row) => isMainAssignment(row),
  description: cancelDescription,
  suppressSideEffectWarning: true,
  inputs: [
    { field: 'lastName',                     required: false, readOnly: true },
    { field: 'firstName',                    required: false, readOnly: true },
    { field: 'secondmentFromCompany',        required: false, readOnly: true, label: '出向元会社（SF非統合）' },
    { field: 'secondmentFromEmployeeNumber', required: false, readOnly: true, label: '出向元社員番号（任意）' },
    { field: 'departmentCode',               required: false, readOnly: true, label: '受入先組織コード' },
    { field: 'employmentType',               required: false, readOnly: true },
  ],
  onOpen: (row) => ({
    lastName:                     row.lastName,
    firstName:                    row.firstName,
    secondmentFromCompany:        row.secondmentFromCompany,
    secondmentFromEmployeeNumber: row.secondmentFromEmployeeNumber,
    departmentCode:               row.departmentCode,
    employmentType:               row.employmentType,
  }),
  onValidate(ctx, rowId) {
    if (!ctx.allocationList.find(r => r.rowId === rowId)) return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },
  onSubmit(ctx, rowId) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return { updatedList: ctx.allocationList.filter(r => r.rowId !== rowId), label: `本務出向受入取消: ${personName(row)}` }
  },
}

const concurrentCancelDescription = 'このセッションで追加した兼務出向受入を取消します。下記の情報が削除されます。'

export const concurrentSecondmentInCancelSFDef: EditOperation = {
  id: 'ConcurrentSecondmentInCancelSF', label: '兼務出向受入取消（SF導入先）',
  group: 'person', badge: 'negative',
  availableFor: (row, ms) => row.concurrentType === '兼務' && isCancelAvailableSF(row, ms),
  description: concurrentCancelDescription,
  suppressSideEffectWarning: true,
  inputs: [
    { field: 'lastName',                     required: false, readOnly: true },
    { field: 'firstName',                    required: false, readOnly: true },
    { field: 'secondmentFromCompany',        required: false, readOnly: true, label: '出向元会社（SF統合）' },
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
  onValidate(ctx, rowId) {
    if (!ctx.allocationList.find(r => r.rowId === rowId)) return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },
  onSubmit(ctx, rowId) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return { updatedList: ctx.allocationList.filter(r => r.rowId !== rowId), label: `兼務出向受入取消: ${personName(row)}` }
  },
}

export const concurrentSecondmentInCancelNonSFDef: EditOperation = {
  id: 'ConcurrentSecondmentInCancelNonSF', label: '兼務出向受入取消（SF未導入先）',
  group: 'person', badge: 'negative',
  availableFor: (row, ms) => row.concurrentType === '兼務' && isCancelAvailableNonSF(row, ms),
  description: concurrentCancelDescription,
  suppressSideEffectWarning: true,
  inputs: [
    { field: 'lastName',                     required: false, readOnly: true },
    { field: 'firstName',                    required: false, readOnly: true },
    { field: 'secondmentFromCompany',        required: false, readOnly: true, label: '出向元会社（SF非統合）' },
    { field: 'secondmentFromEmployeeNumber', required: false, readOnly: true, label: '出向元社員番号（任意）' },
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
  onValidate(ctx, rowId) {
    if (!ctx.allocationList.find(r => r.rowId === rowId)) return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },
  onSubmit(ctx, rowId) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return { updatedList: ctx.allocationList.filter(r => r.rowId !== rowId), label: `兼務出向受入取消: ${personName(row)}` }
  },
}

export const DEFS: EditOperation[] = [
  secondmentOutSFDef,              secondmentOutNonSFDef,
  secondmentInSFDef,               secondmentInNonSFDef,
  secondmentInNewSFDef,            secondmentInNewNonSFDef,
  concurrentSecondmentOutSFDef,    concurrentSecondmentOutNonSFDef,
  concurrentSecondmentInSFDef,     concurrentSecondmentInNonSFDef,
  concurrentSecondmentInNewSFDef,  concurrentSecondmentInNewNonSFDef,
  secondmentOutReleaseSFDef,       secondmentOutReleaseNonSFDef,
  secondmentInReleaseSFDef,        secondmentInReleaseNonSFDef,
  concurrentSecondmentOutReleaseSFDef, concurrentSecondmentOutReleaseNonSFDef,
  concurrentSecondmentInReleaseSFDef,  concurrentSecondmentInReleaseNonSFDef,
  secondmentInCancelSFDef,             secondmentInCancelNonSFDef,
  concurrentSecondmentInCancelSFDef,   concurrentSecondmentInCancelNonSFDef,
]
