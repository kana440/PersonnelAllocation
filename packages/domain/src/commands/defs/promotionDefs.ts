// 昇降格・役職変更 — 昇格・降格・役職変更
import type { EditOperation } from './types'
import { ok, fail } from '../types'
import { derivePromotionSign } from '../../derivation'
import { isRegularEmployee, isSecondmentAcceptance } from '../helpers'
import type { AllocationRow } from '../../allocationRow'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

function applyFields(
  list: AllocationRow[],
  rowId: number,
  values: Partial<AllocationRow>,
  label: string,
) {
  const changes = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))
  return {
    updatedList: list.map(r => r.rowId === rowId ? { ...r, ...changes } : r),
    label,
  }
}

// ── 昇格 ─────────────────────────────────────────────────────────────────────

export const promotionDef: EditOperation = {
  id:         'Promotion',
  label:      '昇格',
  group:      'jobClassification',
  badgeColor: 'bg-green-100 text-green-700',
  suppressSideEffectWarning: true,

  availableFor: (row, cl) =>
    isRegularEmployee(row, cl) && !isSecondmentAcceptance(row, cl),

  inputs: [
    { field: 'band',               required: true,  stepFilter: 'up' },
    { field: 'positionBand',       required: false },
    { field: 'payGrade',           required: false },
    { field: 'officialPositionCode', required: false,
      afterChange: (value) => ({ suggestFieldValue: { field: 'localJobTitle', value } }) },
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

  validate(ctx, rowId, _values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return applyFields(ctx.allocationList, rowId, values, `昇降格: ${personName(row)}`)
  },
}

// ── 降格 ─────────────────────────────────────────────────────────────────────

export const demotionDef: EditOperation = {
  id:         'Demotion',
  label:      '降格',
  group:      'jobClassification',
  badgeColor: 'bg-orange-100 text-orange-700',
  suppressSideEffectWarning: true,

  availableFor: (row, cl) =>
    isRegularEmployee(row, cl) && !isSecondmentAcceptance(row, cl),

  inputs: [
    { field: 'band',               required: true,  stepFilter: 'down' },
    { field: 'positionBand',       required: false },
    { field: 'payGrade',           required: false },
    { field: 'demotionReason',     required: true  },
    { field: 'officialPositionCode', required: false,
      afterChange: (value) => ({ suggestFieldValue: { field: 'localJobTitle', value } }) },
    { field: 'localJobTitle',      required: false },
  ],

  deriveInitial: (row) => ({
    band:               row.band    as string | undefined,
    positionBand:       row.positionBand as string | undefined,
    payGrade:           row.payGrade as string | undefined,
    officialPositionCode: row.officialPositionCode as string | undefined,
    localJobTitle:      row.localJobTitle as string | undefined,
  }),

  validate(ctx, rowId, _values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return applyFields(ctx.allocationList, rowId, values, `降格: ${personName(row)}`)
  },
}

// ── 役職変更（昇降格なし）────────────────────────────────────────────────────

export const titleChangeDef: EditOperation = {
  id:         'TitleChange',
  label:      '役職変更（昇降格なし）',
  group:      'jobClassification',
  badgeColor: 'bg-yellow-100 text-yellow-700',

  availableFor: () => true,

  inputs: [
    { field: 'officialPositionCode', required: true,
      afterChange: (value) => ({ suggestFieldValue: { field: 'localJobTitle', value } }) },
    { field: 'localJobTitle',        required: false },
  ],

  deriveInitial: (row) => ({
    officialPositionCode: row.officialPositionCode as string | undefined,
    localJobTitle:        row.localJobTitle        as string | undefined,
  }),

  validate(ctx, rowId, _values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return applyFields(ctx.allocationList, rowId, values, `役職変更: ${personName(row)}`)
  },
}

export const DEFS: EditOperation[] = [promotionDef, demotionDef, titleChangeDef]
