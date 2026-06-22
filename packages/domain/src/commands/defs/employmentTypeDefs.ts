// 職務内容・雇用形態 — ジョブタイプ変更・雇用延長
import type { EditOperation } from './types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { isRegularEmployee, isExtendedEmployeeTarget } from '../helpers'
import { TR } from '../../transferReasonLabels'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// 雇用延長保存時に空欄化するフィールド
const computeEmploymentExtensionAfter = (): Partial<AllocationRow> => ({
  band:                          undefined,
  payGrade:                      undefined,
  positionBand:                  undefined,
  officialPositionCode:          undefined,
  localJobTitle:                 undefined,
  jobFamily:                     undefined,
  jobType:                       undefined,
  employmentType:                undefined,
  unionFlag:                     undefined,
  discretionaryWorkFlag:         undefined,
  nonUnionAgreementFlag:         undefined,
  positionUnionFlag:             undefined,
  positionDiscretionaryWorkFlag: undefined,
  trainingPositionFlag:          undefined,
})

// ── ジョブタイプ変更 ──────────────────────────────────────────────────────────

export const jobTypeChangeDef: EditOperation = {
  id:         'JobTypeChange',
  label:      '職種変更',
  group:      'jobClassification',
  badge:      'jobChange',

  description: 'ジョブファミリー・ジョブタイプを変更します。給与等級の変更が発生する場合は、適切な給与等級を選択してください。',

  availableFor: () => true,

  inputs: [
    { field: 'transferReason', required: false,
      options: [TR.DIV_TRANSFER], optionsMode: 'suggest' },

    { field: 'memo',           required: false },
    { kind: 'section', label: 'ジョブタイプ情報' },
    { field: 'jobFamily',      required: false },
    { field: 'jobType',        required: true  },
    { field: 'payGrade',       required: false },
  ],

  onOpen: (row) => ({
    transferReason: row.transferReason ?? TR.DIV_TRANSFER as string | undefined,
    jobFamily:      row.jobFamily      as string | undefined,
    jobType:        row.jobType        as string | undefined,
    payGrade:       row.payGrade       as string | undefined,
    memo:           row.memo           ?? '職種変更' as string | undefined,
  }),

  onValidate(ctx, rowId, _values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },

  // ToDo: 給与等級変更を伴う場合はポジション新設が必要（→ 昇格・降格の同名 ToDo と共通課題）。

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const changes = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))
    return {
      updatedList: ctx.allocationList.map(r => r.rowId === rowId ? { ...r, ...changes } : r),
      label: `ジョブタイプ変更: ${personName(row)}`,
    }
  },
}

// ── 雇用延長 ─────────────────────────────────────────────────────────────────

export const employmentExtensionDef: EditOperation = {
  id:         'EmploymentExtension',
  label:      '雇用延長',
  group:      'jobClassification',
  badge:      'jobChange',

  description: '３月末に雇用延長する対象者については、当個別に雇用延長登録いたします。申請書上は申請区分を入力いただき、他の入力項目は空欄にしてください。',

  operationRole: {
    kind:                'lock',
    afterConstraint:     'wipe',
    isActive:            (row) => row.transferReason === TR.EMPLOYMENT_EXTENSION_PROCEDURE,
    isActiveThisSession: (row) => row.transferReason === TR.EMPLOYMENT_EXTENSION_PROCEDURE,
  },

  availableFor: (row, ms) => isExtendedEmployeeTarget(row, ms) || isRegularEmployee(row, ms),

  inputs: [
    { field: 'transferReason', required: true, readOnly: true },
    { field: 'memo',           required: false },
  ],

  onOpen: (row) => ({
    transferReason: TR.EMPLOYMENT_EXTENSION_PROCEDURE as string | undefined,
    memo:           row.memo as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.transferReason) return fail('変更事由は必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const newRow = { ...row }
    for (const [key, value] of Object.entries(computeEmploymentExtensionAfter())) {
      ;(newRow as Record<string, unknown>)[key] = value
    }
    newRow.transferReason = values.transferReason as AllocationRow['transferReason']
    if (values.memo !== undefined) {
      newRow.memo = values.memo as AllocationRow['memo']
    }
    return {
      updatedList: ctx.allocationList.map(r => r.rowId === rowId ? newRow : r),
      label: `雇用延長: ${personName(row)}`,
    }
  },
}

// ── 雇用タイプ変更 ───────────────────────────────────────────────────────────

export const employmentTypeChangeDef: EditOperation = {
  id:         'EmploymentTypeChange',
  label:      '雇用タイプ変更',
  group:      'jobClassification',
  badge:      'jobChange',

  availableFor: (row) => !!row.userId,

  inputs: [
    { field: 'transferReason', required: true, readOnly: true },
    { field: 'memo',           required: false },
    { kind: 'section', label: '雇用タイプ情報' },
    { field: 'employmentType', required: true },
  ],

  onOpen: (row) => ({
    transferReason: TR.EMPLOYMENT_TYPE_CHANGE_PROCEDURE as string | undefined,
    memo:           row.memo           as string | undefined,
    employmentType: row.employmentType as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.employmentType) return fail('雇用タイプは必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    const changes = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined)
    )
    return {
      updatedList: ctx.allocationList.map(r => r.rowId === rowId ? { ...r, ...changes } : r),
      label: `雇用タイプ変更: ${personName(row)}`,
    }
  },
}

export const DEFS: EditOperation[] = [jobTypeChangeDef, employmentExtensionDef, employmentTypeChangeDef]
