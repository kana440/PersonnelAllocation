// 昇降格・役職変更 — 昇格・降格・役職変更
import type { EditOperation } from './types'
import { AVAILABLE } from './types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { DirectEditOperation } from '../handlers/directEdit'
import { TR } from '../../transferReasonLabels'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── 昇格 ─────────────────────────────────────────────────────────────────────
//
// 主操作: positionBand（ポジションのバンド）
// 自動連動: positionBand → band（社員のみ、deriveFieldUpdates が処理）
//           band × jobType → payGrade（deriveFieldUpdates が処理）
// availableFor が社員限定のため、band / payGrade は常に自動導出される（readOnly）

// ToDo: 給与等級変更を伴う昇格では、部下がいる場合はポジション新設フローが必要
//       （新設ポジションに本人・元ポジションに後釜を配置）。UI・ナビゲーション設計が必要。
export const promotionDef: EditOperation = {
  id:          'Promotion',
  label:       '昇格',
  group:       'jobClassification',
  badge:       'positive',
  suppressSideEffectWarning: true,

  availableFor: () => AVAILABLE,

  inputs: [
    // ── ヘッダーインジケーター（自動導出サイン）───────────────────────────
    { field: 'promotionSign',      required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    { field: 'payGradeChangeSign', required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    // ── 最上部: 異動事由 ──────────────────────────────────────────────────
    { field: 'transferReason', required: false, options: [TR.DIV_TRANSFER_REFORM, TR.DIV_TRANSFER], optionsMode: 'suggest' },
    { field: 'memo',           required: false },
    // ── バンドセクション ──────────────────────────────────────────────────
    { kind: 'section', label: 'バンド' },
    { field: 'positionBand',       required: true,  stepFilter: 'up' },
    { field: 'band',               required: false },
    { field: 'payGrade',           required: false },
    { field: 'positionCode',       required: false },
    // ── 役職セクション ────────────────────────────────────────────────────
    { kind: 'section', label: '役職' },
    { field: 'officialPositionCode', required: false },
    { field: 'localJobTitle',        required: false },
    // ── 労働組合員・裁量労働セクション ────────────────────────────────────
    { kind: 'section', label: '労働組合員・裁量労働' },
    { field: 'positionUnionFlag',              required: false },
    { field: 'unionFlag',                      required: false },
    { field: 'positionDiscretionaryWorkFlag',  required: false },
    { field: 'discretionaryWorkFlag',          required: false },
  ],

  onFieldChange: {
    officialPositionCode: (value) => ({ suggestFieldValue: { field: 'localJobTitle', value } }),
  },

  onOpen: (row) => ({
    promotionSign:                row.promotionSign                 as string | undefined,
    payGradeChangeSign:           row.payGradeChangeSign            as string | undefined,
    transferReason:               (row.transferReason ?? TR.DIV_TRANSFER) as string | undefined,
    memo:                         (row.memo ?? '昇格')              as string | undefined,
    positionBand:                 row.positionBand                  as string | undefined,
    band:                         row.band                          as string | undefined,
    payGrade:                     row.payGrade                      as string | undefined,
    positionCode:                 row.positionCode                  as string | undefined,
    officialPositionCode:         row.officialPositionCode          as string | undefined,
    localJobTitle:                row.localJobTitle                 as string | undefined,
    positionUnionFlag:            row.positionUnionFlag             as string | undefined,
    unionFlag:                    row.unionFlag                     as string | undefined,
    positionDiscretionaryWorkFlag: row.positionDiscretionaryWorkFlag as string | undefined,
    discretionaryWorkFlag:        row.discretionaryWorkFlag         as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.positionBand)
      return fail('ポジションバンドは必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return new DirectEditOperation(rowId, values, `昇格: ${personName(row)}`).apply(ctx)
  },
}

// ── 降格 ─────────────────────────────────────────────────────────────────────
//
// 昇格と同じ自動連動モデル（方向が down）
// ToDo: 給与等級変更を伴う降格でも部下がいる場合はポジション新設フローが必要（→ 昇格の同名 ToDo と共通課題）。

export const demotionDef: EditOperation = {
  id:          'Demotion',
  label:       '降格',
  group:       'jobClassification',
  badge:       'negative',
  suppressSideEffectWarning: true,

  availableFor: () => AVAILABLE,

  inputs: [
    // ── ヘッダーインジケーター（自動導出サイン）───────────────────────────
    { field: 'promotionSign',      required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    { field: 'payGradeChangeSign', required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    // ── 最上部 ────────────────────────────────────────────────────────────
    { field: 'transferReason', required: false, options: [TR.DIV_TRANSFER_REFORM, TR.DIV_TRANSFER], optionsMode: 'suggest' },
    { field: 'demotionReason', required: true },
    { field: 'memo',           required: false },
    // ── バンドセクション ──────────────────────────────────────────────────
    { kind: 'section', label: 'バンド' },
    { field: 'positionBand',       required: true,  stepFilter: 'down' },
    { field: 'band',               required: false },
    { field: 'payGrade',           required: false },
    { field: 'positionCode',       required: false },
    // ── 役職セクション ────────────────────────────────────────────────────
    { kind: 'section', label: '役職' },
    { field: 'officialPositionCode', required: false },
    { field: 'localJobTitle',        required: false },
    // ── 労働組合員・裁量労働セクション ────────────────────────────────────
    { kind: 'section', label: '労働組合員・裁量労働' },
    { field: 'positionUnionFlag',             required: false },
    { field: 'unionFlag',                     required: false },
    { field: 'positionDiscretionaryWorkFlag', required: false },
    { field: 'discretionaryWorkFlag',         required: false },
  ],

  onFieldChange: {
    officialPositionCode: (value) => ({ suggestFieldValue: { field: 'localJobTitle', value } }),
  },

  onOpen: (row) => ({
    promotionSign:                row.promotionSign                 as string | undefined,
    payGradeChangeSign:           row.payGradeChangeSign            as string | undefined,
    transferReason:               (row.transferReason ?? TR.DIV_TRANSFER) as string | undefined,
    memo:                         (row.memo ?? '降格')              as string | undefined,
    positionBand:                 row.positionBand                  as string | undefined,
    band:                         row.band                          as string | undefined,
    payGrade:                     row.payGrade                      as string | undefined,
    positionCode:                 row.positionCode                  as string | undefined,
    officialPositionCode:         row.officialPositionCode          as string | undefined,
    localJobTitle:                row.localJobTitle                 as string | undefined,
    positionUnionFlag:            row.positionUnionFlag             as string | undefined,
    unionFlag:                    row.unionFlag                     as string | undefined,
    positionDiscretionaryWorkFlag: row.positionDiscretionaryWorkFlag as string | undefined,
    discretionaryWorkFlag:        row.discretionaryWorkFlag         as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.positionBand)
      return fail('ポジションバンドは必須です')
    if (!values.demotionReason)
      return fail('降格理由は必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return new DirectEditOperation(rowId, values, `降格: ${personName(row)}`).apply(ctx)
  },
}

// ── 役職変更（昇降格なし）────────────────────────────────────────────────────

export const titleChangeDef: EditOperation = {
  id:          'TitleChange',
  label:       '役職変更（昇降格なし）',
  group:       'jobClassification',
  badge:       'jobChange',

  availableFor: () => AVAILABLE,

  inputs: [
    { field: 'transferReason', required: false, options: [TR.DIV_TRANSFER_REFORM, TR.DIV_TRANSFER], optionsMode: 'suggest' },
    { field: 'memo',           required: false },
    { kind: 'section', label: '役職情報' },
    { field: 'officialPositionCode', required: true },
    { field: 'localJobTitle',        required: false },
  ],

  onFieldChange: {
    officialPositionCode: (value) => ({ suggestFieldValue: { field: 'localJobTitle', value } }),
  },

  onOpen: (row) => ({
    transferReason:       (row.transferReason ?? TR.DIV_TRANSFER) as string | undefined,
    memo:                 (row.memo ?? '役職変更')           as string | undefined,
    officialPositionCode: row.officialPositionCode           as string | undefined,
    localJobTitle:        row.localJobTitle                  as string | undefined,
  }),

  onValidate(ctx, rowId, _values) {
    if (!ctx.allocationList.find(r => r.rowId === rowId))
      return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return new DirectEditOperation(rowId, values, `役職変更: ${personName(row)}`).apply(ctx)
  },
}

export const DEFS: EditOperation[] = [promotionDef, demotionDef, titleChangeDef]
