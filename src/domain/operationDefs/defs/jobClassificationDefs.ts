// 職務情報操作 — 昇格・降格・役職変更・ジョブタイプ変更・雇用延長
import type { OperationDef } from '../types'
import {
  PromotionOperation,
  DemotionOperation,
  TitleChangeOperation,
  JobTypeChangeOperation,
} from '../../operation/handlers/patternOps'
import { EmploymentExtensionOperation } from '../../operation/handlers/statusOps'
import { derivePromotionSign } from '../../derivation'
import { isEmployee, isOutsourceAcceptance, isEmploymentExtensionTarget } from '../helpers'

// ── 昇格 ─────────────────────────────────────────────────────────────────────

export const promotionDef: OperationDef = {
  id:         'Promotion',
  label:      '昇格',
  group:      'jobClassification',
  badgeColor: 'bg-green-100 text-green-700',

  availableFor: (row, cl) =>
    isEmployee(row, cl) && !isOutsourceAcceptance(row, cl),

  inputs: [
    { field: 'band',               required: true  },
    { field: 'payGrade',           required: false },
    { field: 'officialPositionCode', required: false },
  ],

  deriveInitial: (row, ctx) => ({
    band:               row.band               as string | undefined,
    payGrade:           row.payGrade           as string | undefined,
    officialPositionCode: row.officialPositionCode as string | undefined,
    ...derivePromotionSign(row.band as string | undefined, row.prevBand as string | undefined, ctx.codeLists),
  }),

  createCommand: (rowId, input) =>
    new PromotionOperation(rowId, {
      band:               input.band as string | undefined,
      payGrade:           input.payGrade as string | undefined,
      officialPositionCode: input.officialPositionCode as string | undefined,
      promotionSign:      input.promotionSign as string | undefined,
    }),
}

// ── 降格 ─────────────────────────────────────────────────────────────────────

export const demotionDef: OperationDef = {
  id:         'Demotion',
  label:      '降格',
  group:      'jobClassification',
  badgeColor: 'bg-orange-100 text-orange-700',

  availableFor: (row, cl) =>
    isEmployee(row, cl) && !isOutsourceAcceptance(row, cl),

  inputs: [
    { field: 'band',               required: true  },
    { field: 'payGrade',           required: false },
    { field: 'demotionReason',     required: true  },
    { field: 'officialPositionCode', required: false },
  ],

  deriveInitial: (row) => ({
    band:    row.band    as string | undefined,
    payGrade: row.payGrade as string | undefined,
  }),

  createCommand: (rowId, input) =>
    new DemotionOperation(rowId, {
      band:               input.band as string | undefined,
      payGrade:           input.payGrade as string | undefined,
      demotionReason:     input.demotionReason as string | undefined,
      officialPositionCode: input.officialPositionCode as string | undefined,
    }),
}

// ── 役職変更（昇降格なし）────────────────────────────────────────────────────

export const titleChangeDef: OperationDef = {
  id:         'TitleChange',
  label:      '役職変更（昇降格なし）',
  group:      'jobClassification',
  badgeColor: 'bg-yellow-100 text-yellow-700',

  availableFor: () => true,

  inputs: [
    { field: 'officialPositionCode', required: true  },
    { field: 'localJobTitle',        required: false },
  ],

  deriveInitial: (row) => ({
    officialPositionCode: row.officialPositionCode as string | undefined,
    localJobTitle:        row.localJobTitle        as string | undefined,
  }),

  createCommand: (rowId, input) =>
    new TitleChangeOperation(rowId, {
      officialPositionCode: input.officialPositionCode as string | undefined,
      localJobTitle:        input.localJobTitle        as string | undefined,
    }),
}

// ── ジョブタイプ変更 ──────────────────────────────────────────────────────────

export const jobTypeChangeDef: OperationDef = {
  id:         'JobTypeChange',
  label:      'ジョブタイプ変更',
  group:      'jobClassification',
  badgeColor: 'bg-purple-100 text-purple-700',

  availableFor: (row, cl) => !isOutsourceAcceptance(row, cl),

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

export const employmentExtensionDef: OperationDef = {
  id:         'EmploymentExtension',
  label:      '雇用延長',
  group:      'jobClassification',
  badgeColor: 'bg-teal-100 text-teal-700',

  availableFor: (row, cl) => isEmploymentExtensionTarget(row, cl),

  inputs: [
    { field: 'employmentType', required: true  },
    { field: 'band',           required: true  },
    { field: 'payGrade',       required: false },
  ],

  deriveInitial: (row) => ({
    employmentType: row.employmentType as string | undefined,
    band:           row.band           as string | undefined,
    payGrade:       row.payGrade       as string | undefined,
  }),

  createCommand: (rowId, input) =>
    new EmploymentExtensionOperation(rowId, {
      employmentType: input.employmentType as string,
      band:           input.band           as string | undefined,
      payGrade:       input.payGrade       as string | undefined,
    }),
}
