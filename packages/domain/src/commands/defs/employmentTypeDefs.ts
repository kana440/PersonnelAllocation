// 職務内容・雇用形態 — ジョブタイプ変更・雇用延長
import type { OperationDef } from './types'
import type { AllocationRow } from '../../allocationRow'
import { JobTypeChangeOperation, EmploymentExtensionOperation } from '../handlers/employmentTypeOps'
import { isRegularEmployee, isSecondmentAcceptance, isExtendedEmployeeTarget } from '../helpers'

// ── ジョブタイプ変更 ──────────────────────────────────────────────────────────

export const jobTypeChangeDef: OperationDef = {
  id:         'JobTypeChange',
  label:      'ジョブタイプ変更',
  group:      'jobClassification',
  badgeColor: 'bg-purple-100 text-purple-700',

  availableFor: (row, cl) => !isSecondmentAcceptance(row, cl),

  inputs: [
    { field: 'jobFamily', required: false },
    { field: 'jobType',   required: true  },
  ],

  deriveInitial: (row) => ({
    jobFamily: row.jobFamily as string | undefined,
    jobType:   row.jobType   as string | undefined,
  }),

  createCommand: (rowId, input) =>
    new JobTypeChangeOperation(rowId, {
      jobFamily: input.jobFamily as string | undefined,
      jobType:   input.jobType   as string | undefined,
    }),
}

// ── 雇用延長 ─────────────────────────────────────────────────────────────────

// 雇用延長保存時に空欄化するフィールド（def と command で共有するローカル関数）
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

export const employmentExtensionDef: OperationDef = {
  id:         'EmploymentExtension',
  label:      '雇用延長',
  group:      'jobClassification',
  badgeColor: 'bg-teal-100 text-teal-700',

  description: '３月末に雇用延長する対象者については、当個別に雇用延長登録いたします。申請書上は申請区分を入力いただき、他の入力項目は空欄にしてください。',

  computeAfterFields: () => computeEmploymentExtensionAfter(),

  availableFor: (row, cl) => isExtendedEmployeeTarget(row, cl) || isRegularEmployee(row, cl),

  inputs: [
    { field: 'transferReason', required: true, readOnly: true },
    { field: 'memo',           required: false },
  ],

  deriveInitial: (row) => ({
    transferReason: '【個別対応】3月末雇用延長手続対象者（新規・更新）' as string | undefined,
    memo:           row.memo as string | undefined,
  }),

  createCommand: (rowId, input) =>
    new EmploymentExtensionOperation(rowId, {
      transferReason:  input.transferReason as string,
      memo:            input.memo           as string | undefined,
      computedFields:  computeEmploymentExtensionAfter(),
    }),
}

export const DEFS: OperationDef[] = [jobTypeChangeDef, employmentExtensionDef]
