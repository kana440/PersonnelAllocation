// 昇降格・役職変更 — 昇格・降格・役職変更
import type { EditOperation } from './types'
import { ok, fail } from '../types'
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
//
// 主操作: positionBand（ポジションのバンド）
// 自動連動: positionBand → band（社員のみ、deriveFieldUpdates が処理）
//           band × jobType → payGrade（deriveFieldUpdates が処理）
// availableFor が社員限定のため、band / payGrade は常に自動導出される（readOnly）

export const promotionDef: EditOperation = {
  id:         'Promotion',
  label:      '昇格',
  group:      'jobClassification',
  badgeColor: 'bg-green-100 text-green-700',
  suppressSideEffectWarning: true,

  availableFor: () => true,

  inputs: [
    // ── ヘッダーインジケーター（自動導出サイン）───────────────────────────
    { field: 'promotionSign',      required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    { field: 'payGradeChangeSign', required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    // ── 最上部: 異動事由 ──────────────────────────────────────────────────
    { field: 'transferReason',  required: false,
      options: ['分掌移動（改組）', '分掌移動'] },
    { field: 'memo',               required: false },
    // ── バンドセクション ──────────────────────────────────────────────────
    { kind: 'section', label: 'バンド' },
    { field: 'positionBand',       required: true,  stepFilter: 'up' },
    { field: 'band',               required: false },
    { field: 'payGrade',           required: false },
    { field: 'positionCode',       required: false },
    // ── 役職セクション ────────────────────────────────────────────────────
    { kind: 'section', label: '役職' },
    { field: 'officialPositionCode', required: false,
      afterChange: (value) => ({ suggestFieldValue: { field: 'localJobTitle', value } }) },
    { field: 'localJobTitle',      required: false },
    // ── 労働組合員・裁量労働セクション ────────────────────────────────────
    { kind: 'section', label: '労働組合員・裁量労働' },
    { field: 'positionUnionFlag',             required: false },
    { field: 'unionFlag',                     required: false },
    { field: 'positionDiscretionaryWorkFlag', required: false },
    { field: 'discretionaryWorkFlag',         required: false },
    { field: 'memo',                          required: false },
  ],

  deriveInitial: (row) => ({
    promotionSign:                row.promotionSign                as string | undefined,
    payGradeChangeSign:           row.payGradeChangeSign           as string | undefined,
    transferReason:               row.transferReason               as string | undefined,
    positionBand:                 row.positionBand                 as string | undefined,
    band:                         row.band                         as string | undefined,
    payGrade:                     row.payGrade                     as string | undefined,
    positionCode:                 row.positionCode                 as string | undefined,
    officialPositionCode:         row.officialPositionCode         as string | undefined,
    localJobTitle:                row.localJobTitle                as string | undefined,
    positionUnionFlag:            row.positionUnionFlag            as string | undefined,
    unionFlag:                    row.unionFlag                    as string | undefined,
    positionDiscretionaryWorkFlag: row.positionDiscretionaryWorkFlag as string | undefined,
    discretionaryWorkFlag:        row.discretionaryWorkFlag        as string | undefined,
  }),

  validate(ctx, rowId, values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.positionBand)
      return fail('ポジションバンドは必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return applyFields(ctx.allocationList, rowId, values, `昇格: ${personName(row)}`)
  },
}

// ── 降格 ─────────────────────────────────────────────────────────────────────
//
// 昇格と同じ自動連動モデル（方向が down）

export const demotionDef: EditOperation = {
  id:         'Demotion',
  label:      '降格',
  group:      'jobClassification',
  badgeColor: 'bg-orange-100 text-orange-700',
  suppressSideEffectWarning: true,

  availableFor: () => true,

  inputs: [
    // ── ヘッダーインジケーター（自動導出サイン）───────────────────────────
    { field: 'promotionSign',      required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    { field: 'payGradeChangeSign', required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    // ── 最上部 ────────────────────────────────────────────────────────────
    { field: 'transferReason',  required: false,
      options: ['分掌移動（改組）', '分掌移動'] },    { field: 'demotionReason',     required: true },
    { field: 'memo',                          required: false },
    // ── バンドセクション ──────────────────────────────────────────────────
    { kind: 'section', label: 'バンド' },
    { field: 'positionBand',       required: true,  stepFilter: 'down' },
    { field: 'band',               required: false },
    { field: 'payGrade',           required: false },
    { field: 'positionCode',       required: false },
    // ── 役職セクション ────────────────────────────────────────────────────
    { kind: 'section', label: '役職' },
    { field: 'officialPositionCode', required: false,
      afterChange: (value) => ({ suggestFieldValue: { field: 'localJobTitle', value } }) },
    { field: 'localJobTitle',      required: false },
    // ── 労働組合員・裁量労働セクション ────────────────────────────────────
    { kind: 'section', label: '労働組合員・裁量労働' },
    { field: 'positionUnionFlag',             required: false },
    { field: 'unionFlag',                     required: false },
    { field: 'positionDiscretionaryWorkFlag', required: false },
    { field: 'discretionaryWorkFlag',         required: false },
  ],

  deriveInitial: (row) => ({
    promotionSign:                row.promotionSign                as string | undefined,
    payGradeChangeSign:           row.payGradeChangeSign           as string | undefined,
    transferReason:               row.transferReason               as string | undefined,
    positionBand:                 row.positionBand                 as string | undefined,
    band:                         row.band                         as string | undefined,
    payGrade:                     row.payGrade                     as string | undefined,
    positionCode:                 row.positionCode                 as string | undefined,
    officialPositionCode:         row.officialPositionCode         as string | undefined,
    localJobTitle:                row.localJobTitle                as string | undefined,
    positionUnionFlag:            row.positionUnionFlag            as string | undefined,
    unionFlag:                    row.unionFlag                    as string | undefined,
    positionDiscretionaryWorkFlag: row.positionDiscretionaryWorkFlag as string | undefined,
    discretionaryWorkFlag:        row.discretionaryWorkFlag        as string | undefined,
    memo:                         row.memo                         as string | undefined,
  }),

  validate(ctx, rowId, values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.positionBand)
      return fail('ポジションバンドは必須です')
    if (!values.demotionReason)
      return fail('降格理由は必須です')
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
    { field: 'transferReason',       required: false },
    { field: 'memo',                 required: false },
    { kind: 'section', label: '役職情報' },
    { field: 'officialPositionCode', required: true,
      afterChange: (value) => ({ suggestFieldValue: { field: 'localJobTitle', value } }) },
    { field: 'localJobTitle',        required: false },
  ],

  deriveInitial: (row) => ({
    transferReason:       row.transferReason       as string | undefined,
    memo:                 row.memo                 as string | undefined,
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
