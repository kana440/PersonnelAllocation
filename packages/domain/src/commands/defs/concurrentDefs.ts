// 兼務 — 社内兼務追加・解除
import type { EditOperation } from './types'
import { AVAILABLE, unavailable } from './types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { nextRowId } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'
import { isMainAssignment } from '../helpers'
import { TR } from '../../transferReasonLabels'

function inputName(values: Partial<AllocationRow>): string {
  return [values.lastName, values.firstName].filter(Boolean).join(' ') || '（氏名未入力）'
}

// ── 社内兼務追加（本務行コピー） ──────────────────────────────────────────────

export const concurrentAddDef: EditOperation = {
  id:         'ConcurrentAdd',
  label:      '社内兼務追加',
  group:      'position',
  badge: 'concurrent',

  availableFor(row) {
    if (!row.userId)            return unavailable('担当者が配属されていない行には設定できません')
    if (!isMainAssignment(row)) return unavailable('本務行のみ対象です（兼務行には設定できません）')
    return AVAILABLE
  },

  inputs: [
    { field: 'transferReason',   required: false, options: [TR.SECONDMENT_IN] },
    { field: 'concurrentReason', required: false },
    { field: 'lastName',         required: true  },
    { field: 'firstName',        required: true  },
    { field: 'userId',           required: false },
    { field: 'groupEmployeeId',  required: false, readOnly: true },
    { field: 'employeeNumber',   required: false, readOnly: true },
    { field: 'employmentType',   required: false, readOnly: true },
    { field: 'departmentCode',   required: true,  label: '兼務先組織', picker: 'org' },
    { field: 'jobFamily',        required: false },
    { field: 'jobType',          required: false },
    { field: 'positionBand',     required: false },
    { field: 'band',             required: false },
    { field: 'payGrade',         required: false },
    { field: 'memo',             required: false },
  ],

  onOpen: (row) => ({
    transferReason:  TR.SECONDMENT_IN,
    lastName:        row.lastName,
    firstName:       row.firstName,
    groupEmployeeId: row.groupEmployeeId,
    employeeNumber:  row.employeeNumber,
    employmentType:  row.employmentType,
    jobFamily:       row.jobFamily,
    jobType:         row.jobType,
    memo:            row.memo as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType === '兼務') return fail('兼務行には兼務を追加できません（本務行を指定してください）')
    if (!values.lastName)       return fail('姓は必須です')
    if (!values.firstName)      return fail('名は必須です')
    if (!values.departmentCode) return fail('兼務先組織コードは必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const src      = ctx.allocationList.find(r => r.rowId === rowId)!
    const newRowId = nextRowId(ctx.allocationList)
    const orgSub   = deriveOrgSubFields(values.departmentCode as string, ctx.masters)
    const formVals = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== ''))

    const newRow: AllocationRow = {
      // src から引き継ぐのは担当者（assignee）のみ。prevXxx は一切引き継がない
      assignee:             src.assignee,
      ...orgSub,
      ...formVals,
      rowId:                newRowId,
      positionCode:         `_pos_${newRowId}`,
      departmentCode:       values.departmentCode as string,
      concurrentType:       '兼務',
      trainingPositionFlag: (values.trainingPositionFlag as string | undefined) ?? '0',
      userId:               (values.userId as string | undefined) || undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `社内兼務追加: ${inputName(values)}`,
    }
  },
}

// ── 社内兼務追加（新規：組織パネルボタンから） ────────────────────────────────

export const concurrentAddNewDef: EditOperation = {
  id:         'ConcurrentAddNew',
  label:      '社内兼務追加（新規）',
  group:      'position',
  badge: 'concurrent',

  // 組織パネルボタンからのみ起動。行メニューには表示しない
  availableFor: () => unavailable('組織パネルボタンからのみ起動できます'),

  inputs: [
    { field: 'transferReason',   required: false },
    { field: 'departmentCode',   required: true,  label: '兼務先組織', picker: 'org' },
    { field: 'userId',           required: false, label: '本務者を検索（任意）', picker: 'person' },
    { field: 'lastName',         required: true  },
    { field: 'firstName',        required: true  },
    { field: 'groupEmployeeId',  required: false },
    { field: 'employeeNumber',   required: false },
    { field: 'employmentType',   required: false },
    { field: 'jobFamily',        required: false },
    { field: 'jobType',          required: false },
    { field: 'positionBand',     required: false },
    { field: 'band',             required: false },
    { field: 'payGrade',         required: false },
    { field: 'concurrentReason', required: false },
    { field: 'memo',             required: false },
  ],

  // 組織ボタン起動時: row.departmentCode に初期組織コードが入ってくる
  onOpen: (row) => ({
    departmentCode: row.departmentCode,
  }),

  onValidate(_ctx, _rowId, values) {
    if (!values.lastName)       return fail('姓は必須です')
    if (!values.firstName)      return fail('名は必須です')
    if (!values.departmentCode) return fail('兼務先組織コードは必須です')
    return ok()
  },

  onSubmit(ctx, _rowId, values) {
    const newRowId = nextRowId(ctx.allocationList)
    const orgSub   = values.departmentCode
      ? deriveOrgSubFields(values.departmentCode as string, ctx.masters)
      : {}
    const formVals = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== ''))

    const newRow: AllocationRow = {
      ...orgSub,
      ...formVals,
      rowId:                newRowId,
      positionCode:         `_pos_${newRowId}`,
      departmentCode:       (values.departmentCode as string) || '',
      concurrentType:       '兼務',
      trainingPositionFlag: (values.trainingPositionFlag as string | undefined) ?? '0',
      userId:               (values.userId as string | undefined) || undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `社内兼務追加（新規）: ${inputName(values)}`,
    }
  },
}

// ── 社内兼務追加取消（セッション内追加分） ────────────────────────────────────

export const concurrentAddCancelDef: EditOperation = {
  id:         'ConcurrentAddCancel',
  label:      '社内兼務追加取消',
  group:      'position',
  badge: 'negative',

  description: 'このセッションで追加した社内兼務を取消します。下記の情報が削除されます。',
  suppressSideEffectWarning: true,

  // prevConcurrentType が空 = このセッションで追加した行
  availableFor(row) {
    if (row.concurrentType !== '兼務')  return unavailable('兼務行のみ対象です')
    if (row.prevConcurrentType)         return unavailable('インポート前から存在する兼務行は取消できません（解除操作を使用してください）')
    if (row.secondmentToCompany)        return unavailable('出向兼務行は出向解除操作を使用してください')
    if (row.secondmentFromCompany)      return unavailable('出向兼務受入行は出向解除操作を使用してください')
    return AVAILABLE
  },

  inputs: [
    { field: 'lastName',         required: false, readOnly: true },
    { field: 'firstName',        required: false, readOnly: true },
    { field: 'employmentType',   required: false, readOnly: true },
    { field: 'departmentCode',   required: false, readOnly: true, label: '兼務先組織コード' },
    { field: 'band',             required: false, readOnly: true },
    { field: 'payGrade',         required: false, readOnly: true },
    { field: 'concurrentReason', required: false, readOnly: true },
  ],

  onOpen: (row) => ({
    lastName:         row.lastName,
    firstName:        row.firstName,
    employmentType:   row.employmentType,
    departmentCode:   row.departmentCode,
    band:             row.band,
    payGrade:         row.payGrade,
    concurrentReason: row.concurrentReason,
  }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務' || row.prevConcurrentType)
      return fail('このセッションで追加した社内兼務行ではありません')
    return ok()
  },

  onSubmit(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== rowId),
      label: `社内兼務追加取消: ${name}`,
    }
  },
}

// ── 社内兼務解除（既存の兼務行を業務的に解除） ────────────────────────────────

export const concurrentReleaseDef: EditOperation = {
  id:         'ConcurrentRelease',
  label:      '社内兼務解除',
  group:      'position',
  badge: 'concurrent',

  // prevConcurrentType = '兼務' → インポート時から兼務として存在していた行のみ対象
  // セッション内追加分は ConcurrentAddCancel で対処する
  availableFor(row) {
    if (row.concurrentType !== '兼務')  return unavailable('兼務行のみ対象です')
    if (!row.prevConcurrentType)        return unavailable('このセッションで追加した兼務行は「社内兼務追加取消」を使用してください')
    if (row.secondmentToCompany)        return unavailable('出向兼務行は出向解除操作を使用してください')
    if (row.secondmentFromCompany)      return unavailable('出向兼務受入行は出向解除操作を使用してください')
    return AVAILABLE
  },

  inputs: [
    { field: 'transferReason', required: true, readOnly: true },
    { field: 'memo',           required: false },
  ],

  onOpen: () => ({
    transferReason: TR.CONCURRENT_OR_SECONDMENT_IN_RELEASE,
  }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務')
      return fail('この行は兼務行ではありません')
    if (row.secondmentToCompany || row.secondmentFromCompany)
      return fail('出向兼務行は社内兼務解除ではなく出向解除操作を使用してください')
    return ok()
  },

  onSubmit(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== rowId),
      label: `社内兼務解除: ${name}`,
    }
  },
}

export const DEFS: EditOperation[] = [concurrentAddDef, concurrentAddNewDef, concurrentAddCancelDef, concurrentReleaseDef]
