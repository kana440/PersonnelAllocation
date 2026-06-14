// 昇降格・役職変更 — 昇格・降格・役職変更
import type { OperationDef } from './types'
import {
  PromotionOperation,
  DemotionOperation,
  TitleChangeOperation,
} from '../handlers/promotionOps'
import { derivePromotionSign } from '../../derivation'
import { isRegularEmployee, isSecondmentAcceptance } from '../helpers'

// ── 昇格 ─────────────────────────────────────────────────────────────────────

export const promotionDef: OperationDef = {
  id:         'Promotion',
  label:      '昇格',
  group:      'jobClassification',
  badgeColor: 'bg-green-100 text-green-700',

  availableFor: (row, cl) =>
    isRegularEmployee(row, cl) && !isSecondmentAcceptance(row, cl),

  inputs: [
    { field: 'band',               required: true,  stepFilter: 'up' },
    { field: 'positionBand',       required: false },
    { field: 'payGrade',           required: false },
    { field: 'officialPositionCode', required: false },
    { field: 'localJobTitle',      required: false },
  ],

  deriveInitial: (row, ctx) => ({
    band:               row.band               as string | undefined,
    positionBand:       row.positionBand       as string | undefined,
    payGrade:           row.payGrade           as string | undefined,
    officialPositionCode: row.officialPositionCode as string | undefined,
    localJobTitle:      row.localJobTitle      as string | undefined,
    ...derivePromotionSign(row.band as string | undefined, row.prevBand as string | undefined, ctx.codeLists),
  }),

  createCommand: (rowId, input) =>
    new PromotionOperation(rowId, {
      band:               input.band               as string | undefined,
      positionBand:       input.positionBand       as string | undefined,
      positionCode:       input.positionCode       as string | undefined,
      payGrade:           input.payGrade           as string | undefined,
      officialPositionCode: input.officialPositionCode as string | undefined,
      localJobTitle:      input.localJobTitle      as string | undefined,
      promotionSign:      input.promotionSign      as string | undefined,
      payGradeChangeSign: input.payGradeChangeSign as string | undefined,
    }),
}

// ── 降格 ─────────────────────────────────────────────────────────────────────

export const demotionDef: OperationDef = {
  id:         'Demotion',
  label:      '降格',
  group:      'jobClassification',
  badgeColor: 'bg-orange-100 text-orange-700',

  availableFor: (row, cl) =>
    isRegularEmployee(row, cl) && !isSecondmentAcceptance(row, cl),

  inputs: [
    { field: 'band',               required: true,  stepFilter: 'down' },
    { field: 'positionBand',       required: false },
    { field: 'payGrade',           required: false },
    { field: 'demotionReason',     required: true  },
    { field: 'officialPositionCode', required: false },
    { field: 'localJobTitle',      required: false },
  ],

  deriveInitial: (row) => ({
    band:               row.band    as string | undefined,
    positionBand:       row.positionBand as string | undefined,
    payGrade:           row.payGrade as string | undefined,
    officialPositionCode: row.officialPositionCode as string | undefined,
    localJobTitle:      row.localJobTitle as string | undefined,
  }),

  createCommand: (rowId, input) =>
    new DemotionOperation(rowId, {
      band:               input.band               as string | undefined,
      positionBand:       input.positionBand       as string | undefined,
      positionCode:       input.positionCode       as string | undefined,
      payGrade:           input.payGrade           as string | undefined,
      demotionReason:     input.demotionReason     as string | undefined,
      officialPositionCode: input.officialPositionCode as string | undefined,
      localJobTitle:      input.localJobTitle      as string | undefined,
      payGradeChangeSign: input.payGradeChangeSign as string | undefined,
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

export const DEFS: OperationDef[] = [promotionDef, demotionDef, titleChangeDef]
