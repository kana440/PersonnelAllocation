// 昇降格・役職変更 — 昇格・降格・役職変更
import type { EditOperation } from './types'
import { AVAILABLE, unavailable } from './types'
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
// 自動連動: positionBand → band（deriveFieldUpdates が処理）
//           band × jobType → payGrade（deriveFieldUpdates が処理）
//           payGrade 変化 → payGradeChangeSign がセットされる
//
// ポジション変更について:
//   昇格では必ず給与等級が上がるため、ポジション変更が必要。
//   フォーム内の [変更] ボタンで新規採番（_pos_XXXX）または既存空きポジションへの移動を選択する。
//   後任者のポジションは別途 OrgRestructure 等で対応する（この操作では行なしパターンのみ）。
export const promotionDef: EditOperation = {
  id:          'Promotion',
  label:       '昇格',
  group:       'jobClassification',
  badge:       'positive',
  suppressSideEffectWarning: true,

  description: 'ポジションバンドを上げる昇格を記入します。ポジションバンド変更によりバンド・給与等級が自動導出されます。給与等級が変わる場合はポジション変更が必要です（フォーム内「変更」ボタンから新規採番または既存空きポジションへの移動を選択してください）。',

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
    { field: 'positionCode',       required: false, readOnly: true, picker: 'newPosition' },
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
// 昇格と同じ自動連動モデル（方向が down）。
// 降格でも給与等級が下がるため、ポジション変更が必要（昇格と同じ行なしパターン）。

export const demotionDef: EditOperation = {
  id:          'Demotion',
  label:       '降格',
  group:       'jobClassification',
  badge:       'negative',
  suppressSideEffectWarning: true,

  description: 'ポジションバンドを下げる降格を記入します。降格理由の入力が必須です。ポジションバンド変更によりバンド・給与等級が自動導出されます。給与等級が変わる場合はポジション変更が必要です（フォーム内「変更」ボタンから対応してください）。',

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
    { field: 'positionCode',       required: false, readOnly: true, picker: 'newPosition' },
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

// ── 役職名変更（昇降格なし）──────────────────────────────────────────────────

export const titleChangeDef: EditOperation = {
  id:          'TitleChange',
  label:       '役職名変更',
  group:       'jobClassification',
  badge:       'jobChange',

  description: '昇降格を伴わない役職名（フリータイトル）の変更を記入します。役職を入力するとフリータイトルの自動提案が表示されます。',

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
    memo:                 (row.memo ?? '役職名変更')         as string | undefined,
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
    return new DirectEditOperation(rowId, values, `役職名変更: ${personName(row)}`).apply(ctx)
  },
}

// ── M職P職切替（読み替えバンドが同一の別バンドに切替）────────────────────────

export const mpTrackSwitchDef: EditOperation = {
  id:          'MpTrackSwitch',
  label:       'M職P職切替',
  group:       'jobClassification',
  badge:       'jobChange',
  description: 'bandは変わるが、昇降格判定に使う読み替えband（promotionDemotionBand）が同一のため給与等級は変わらない。ポジション変更は不要。',

  availableFor: (row, masters) => {
    const currentBand = row.band as string | undefined
    if (!currentBand || !row.userId) return unavailable('在席者がいません')
    const currentEntry = masters.jobLevels.find(e => e.label === currentBand || e.code === currentBand)
    if (!currentEntry?.promotionDemotionBand) return unavailable('切替可能なバンドがありません')
    const siblings = masters.jobLevels.filter(
      e => e.promotionDemotionBand === currentEntry.promotionDemotionBand && e.label !== currentBand
    )
    return siblings.length > 0 ? AVAILABLE : unavailable('切替可能なバンドがありません')
  },

  inputs: [
    { field: 'transferReason', required: false, options: [TR.DIV_TRANSFER_REFORM, TR.DIV_TRANSFER], optionsMode: 'suggest' },
    { field: 'memo',           required: false },
    { kind: 'section', label: 'バンド切替' },
    {
      field:   'band',
      label:   '切替後バンド',
      required: true,
      options: (ctx, row) => {
        const currentBand  = row?.band as string | undefined
        if (!currentBand) return ctx.masters.jobLevels.map(e => e.label)
        const currentEntry = ctx.masters.jobLevels.find(e => e.label === currentBand || e.code === currentBand)
        if (!currentEntry?.promotionDemotionBand) return ctx.masters.jobLevels.map(e => e.label)
        return ctx.masters.jobLevels
          .filter(e => e.promotionDemotionBand === currentEntry.promotionDemotionBand && e.label !== currentBand)
          .map(e => e.label)
      },
    },
    { kind: 'section', label: '役職情報' },
    { field: 'officialPositionCode', required: false },
    { field: 'localJobTitle',        required: false },
  ],

  onFieldChange: {
    officialPositionCode: (value) => ({ suggestFieldValue: { field: 'localJobTitle', value } }),
  },

  onOpen: (row, ctx) => {
    const currentBand  = row.band as string | undefined
    const currentEntry = currentBand
      ? ctx.masters.jobLevels.find(e => e.label === currentBand || e.code === currentBand)
      : undefined
    const alternatives = currentEntry?.promotionDemotionBand
      ? ctx.masters.jobLevels
          .filter(e => e.promotionDemotionBand === currentEntry.promotionDemotionBand && e.label !== currentBand)
          .map(e => e.label)
      : []
    return {
      transferReason:       (row.transferReason ?? TR.DIV_TRANSFER) as string | undefined,
      memo:                 (row.memo ?? 'M職P職切替')              as string | undefined,
      band:                 (alternatives.length === 1 ? alternatives[0] : undefined) as string | undefined,
      officialPositionCode: row.officialPositionCode                as string | undefined,
      localJobTitle:        row.localJobTitle                       as string | undefined,
    }
  },

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!values.band) return fail('切替後のバンドを選択してください')
    const originalBand = row.band as string | undefined
    if (values.band === originalBand) return fail('現在と同じバンドです')
    const origEntry = ctx.masters.jobLevels.find(e => e.label === originalBand || e.code === originalBand)
    const newEntry  = ctx.masters.jobLevels.find(e => e.label === values.band   || e.code === values.band)
    if (!origEntry?.promotionDemotionBand || !newEntry?.promotionDemotionBand)
      return fail('バンドの読み替え情報がありません')
    if (origEntry.promotionDemotionBand !== newEntry.promotionDemotionBand)
      return fail('同一レベルのバンドを選択してください')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return new DirectEditOperation(
      rowId,
      {
        transferReason:       values.transferReason,
        memo:                 values.memo,
        band:                 values.band,
        positionBand:         values.band,
        officialPositionCode: values.officialPositionCode,
        localJobTitle:        values.localJobTitle,
      },
      `M職P職切替: ${personName(row)}`,
    ).apply(ctx)
  },
}

export const DEFS: EditOperation[] = [promotionDef, demotionDef, titleChangeDef, mpTrackSwitchDef]
