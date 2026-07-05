// 昇降格・役職変更 — 昇格・降格・役職変更
import type { EditOperation, SectionDivider, OperationInput } from './types'
import { AVAILABLE, unavailable } from './types'
import { ok, fail } from '../types'
import type { DomainContext, OperationResult } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding, nextRowId } from '../../allocationRow'
import { DirectEditOperation } from '../handlers/directEdit'
import { deriveManagerName } from '../orgHelpers'
import { TR } from '../../transferReasonLabels'
import type { PromotionMatrixEntry } from '../../masters/promotionMatrix'
import type { FieldRule } from '../../rules/field'

// ── アクション制約ヘルパー ────────────────────────────────────────────────────

/**
 * バンド（band / positionBand）の昇降格方向制約を生成する。
 *
 * prevXxx フィールドと比較して「現在より上位/下位のバンドのみ有効」と宣言する。
 * stepMode（1段階/2段階）は UI 側の Profile が担当するため、ここでは direction のみ。
 *
 * AI 文脈で "1段階昇格" のような完全指定アクションを実装する場合は、
 * source 関数内で step 数まで絞り込んだ FieldRule を別途定義する。
 */
function bandDirectionConstraint(
  direction: 'up' | 'down',
  field:     'band' | 'positionBand',
): FieldRule {
  const prevField = field === 'band' ? 'prevBand' : 'prevPositionBand'
  return {
    field,
    value:      'none',
    options:    'split',
    validation: 'error',
    when:  (row) => !!(row[prevField as keyof AllocationRow]),
    source: (masters, row) => {
      const prevLabel = row[prevField as keyof AllocationRow] as string | undefined
      const prevLevel = masters.jobLevels.find(e => e.label === prevLabel)?.promotionDemotionWarningLevel
      if (prevLevel === undefined) return masters.jobLevels.map(e => e.label)
      return masters.jobLevels.filter(e => {
        const lvl = e.promotionDemotionWarningLevel ?? 0
        return direction === 'up' ? lvl > prevLevel : lvl < prevLevel
      }).map(e => e.label)
    },
    message: (val) => direction === 'up'
      ? `バンド「${val}」は昇格方向（現在より上位）の選択肢から選択してください`
      : `バンド「${val}」は降格方向（現在より下位）の選択肢から選択してください`,
  }
}

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── 部下引き継ぎ共有ヘルパー ──────────────────────────────────────────────────

/**
 * onOpen で現在のポジションコードを参照する部下が存在するか検出する。
 * 部下がいる場合は '_managerTransferMode: "引き継ぐ"' を返す（フォームの初期値として使用）。
 * SUBORDINATE_TRANSFER_INPUTS の options と値を合わせること。
 */
export function detectSubordinateMode(
  row: AllocationRow,
  ctx: DomainContext,
): '引き継ぐ' | undefined {
  const posCode = row.positionCode as string | undefined
  if (!posCode) return undefined
  return ctx.allocationList.some(r => r.managerPositionCode === posCode) ? '引き継ぐ' : undefined
}

/**
 * 部下引き継ぎ入力フィールド定義。
 * visibleWhen で _managerTransferMode が設定されている行（= 部下がいる）にのみ表示する。
 */
export const SUBORDINATE_TRANSFER_INPUTS: (SectionDivider | OperationInput)[] = [
  { kind: 'section', label: '部下の引き継ぎ' },
  {
    field:       '_managerTransferMode',
    label:       '部下の引き継ぎ方法',
    required:    false,
    options:     ['引き継ぐ', '他メンバに引き継ぎ'],
    optionsMode: 'restrict',
    visibleWhen: (values) => values._managerTransferMode !== undefined,
  },
]

/**
 * ポジション変更後に部下の引き継ぎ処理を適用する。
 *
 * - positionCode が変化していない場合: そのまま返す
 * - '他メンバに引き継ぎ': 旧ポジションコードを持つ空席行を追加
 * - '引き継ぐ'（デフォルト）: 部下の managerPositionCode・managerName を新ポジションへ一括更新
 */
export function applySubordinateTransfer(
  originalRow: AllocationRow,
  values:      Partial<AllocationRow>,
  result:      OperationResult,
): OperationResult {
  const oldCode = originalRow.positionCode as string | undefined
  const newCode = values.positionCode       as string | undefined
  if (!oldCode || !newCode || oldCode === newCode) return result

  const subordinates = result.updatedList.filter(r => r.managerPositionCode === oldCode)
  if (subordinates.length === 0) return result

  if (values._managerTransferMode === '他メンバに引き継ぎ') {
    // 他メンバに引き継ぎ: 旧ポジションコードを引き継ぐ空席行を追加
    const jobInfoClears = Object.fromEntries(afterKeysByBinding('jobInfo').map(k => [k, undefined]))
    const vacantRow: AllocationRow = {
      ...originalRow,
      rowId:  nextRowId(result.updatedList),
      userId: undefined,
      ...jobInfoClears,
    }
    return { ...result, updatedList: [...result.updatedList, vacantRow] }
  }

  // 引き継ぐ（デフォルト）: 部下の上司 Pos コード・上司名を新ポジションへ更新
  const updatedList = result.updatedList.map(r => {
    if ((r.managerPositionCode as string | undefined) !== oldCode) return r
    return {
      ...r,
      managerPositionCode: newCode,
      managerName:         deriveManagerName(newCode, result.updatedList),
    }
  })
  return { ...result, updatedList }
}

// ── 昇降格マトリクス ヘルパー ─────────────────────────────────────────────────

/**
 * 昇降格マトリクスで現在の (positionBand, officialPositionCode) に対応するエントリを返す。
 * マッチしない場合は undefined。
 */
function findMatrixEntry(
  positionBand: string | undefined,
  officialPositionCode: string | undefined,
  matrix: PromotionMatrixEntry[],
): PromotionMatrixEntry | undefined {
  if (!positionBand || !officialPositionCode) return undefined
  return matrix.find(e => e.jobLevel === positionBand && e.officialPosition === officialPositionCode)
}

/**
 * 指定バンドに対応するマトリクスエントリを jobClass（現在のM/P職）を優先して並べた officialPosition リストを返す。
 * currentJobClass と一致するものを先頭に、それ以外を後続に表示する。
 */
function suggestOfficialPositions(
  newBand: string,
  currentJobClass: string | undefined,
  matrix: PromotionMatrixEntry[],
): string[] {
  const candidates = matrix.filter(e => e.jobLevel === newBand)
  if (candidates.length === 0) return []
  const sameClass  = candidates.filter(e => currentJobClass && e.jobClass === currentJobClass).map(e => e.officialPosition)
  const otherClass = candidates.filter(e => !currentJobClass || e.jobClass !== currentJobClass).map(e => e.officialPosition)
  return [...new Set([...sameClass, ...otherClass])]
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

  // アクション制約: positionBand / band は「現在より上位」のみ有効
  // stepMode（1段階/2段階）は UI 側 BandStepFilter + Profile が担当
  constraints: [
    bandDirectionConstraint('up', 'positionBand'),
    bandDirectionConstraint('up', 'band'),
  ],

  description: 'ポジションバンドを上げる昇格を記入します。ポジションバンド変更によりバンド・給与等級が自動導出されます。給与等級が変わる場合はポジション変更が必要です（フォーム内「変更」ボタンから新規採番または既存空きポジションへの移動を選択してください）。',

  availableFor: () => AVAILABLE,

  // 簡易モード: positionBand と役職名だけ入力、残りは自動導出
  quickInputs: [
    { field: 'positionBand',        required: true,  stepFilter: 'up' },
    { field: 'officialPositionCode', required: false },
  ],

  inputs: [
    // ── ヘッダーインジケーター（自動導出サイン）───────────────────────────
    { field: 'promotionSign',      required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    { field: 'payGradeChangeSign', required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    // ── 最上部: 異動事由 ──────────────────────────────────────────────────
    { field: 'transferReason', required: false, options: [TR.DIV_TRANSFER_RESTRUCTURE, TR.DIV_TRANSFER], optionsMode: 'suggest' },
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
    // ── 部下の引き継ぎ（部下がいる場合のみ表示）───────────────────────────
    ...SUBORDINATE_TRANSFER_INPUTS,
  ],

  onFieldChange: {
    positionBand: (newBand, ctx, currentValues) => {
      const matrix = ctx.masters.promotionMatrix ?? []
      // band を positionBand と明示的に同期（isRegularEmp チェックをバイパス）
      const base: Partial<AllocationRow> = { band: newBand }
      if (!matrix.length) return { setValues: base }
      const currentJobClass = currentValues?._currentJobClass as string | undefined
      const suggestions = suggestOfficialPositions(newBand, currentJobClass, matrix)
      if (!suggestions.length) return { setValues: base }
      return { setValues: { ...base, officialPositionCode: suggestions[0] } }
    },
    officialPositionCode: (value) => ({ suggestFieldValue: { field: 'localJobTitle', value } }),
  },

  onOpen: (row, ctx) => {
    const matrix = ctx.masters.promotionMatrix ?? []
    const matrixEntry = findMatrixEntry(
      row.positionBand as string | undefined,
      row.officialPositionCode as string | undefined,
      matrix,
    )
    return {
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
      _managerTransferMode:         detectSubordinateMode(row, ctx),
      _currentJobClass:             matrixEntry?.jobClass,
    }
  },

  createCommand(rowId, values) {
    return {
      kind: 'Promotion',
      validate(ctx) {
        if (!ctx.allocationList.find(r => r.rowId === rowId))
          return fail(`行が見つかりません (rowId: ${rowId})`)
        if (!values.positionBand)
          return fail('ポジションバンドは必須です')
        return ok()
      },
      apply(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)!
        const { _managerTransferMode, _currentJobClass: _jc1, ...cleanValues } = values
        const label = `昇格: ${personName(row)}`
        const result = new DirectEditOperation(rowId, cleanValues, label).apply(ctx)
        return applySubordinateTransfer(row, values, result)
      },
    }
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

  // アクション制約: positionBand / band は「現在より下位」のみ有効
  constraints: [
    bandDirectionConstraint('down', 'positionBand'),
    bandDirectionConstraint('down', 'band'),
  ],

  description: 'ポジションバンドを下げる降格を記入します。降格理由の入力が必須です。ポジションバンド変更によりバンド・給与等級が自動導出されます。給与等級が変わる場合はポジション変更が必要です（フォーム内「変更」ボタンから対応してください）。',

  availableFor: () => AVAILABLE,

  // 簡易モード: positionBand・降格理由・役職名だけ入力（降格理由は必須のため含める）
  quickInputs: [
    { field: 'positionBand',         required: true,  stepFilter: 'down' },
    { field: 'demotionReason',       required: true },
    { field: 'officialPositionCode', required: false },
  ],

  inputs: [
    // ── ヘッダーインジケーター（自動導出サイン）───────────────────────────
    { field: 'promotionSign',      required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    { field: 'payGradeChangeSign', required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    // ── 最上部 ────────────────────────────────────────────────────────────
    { field: 'transferReason', required: false, options: [TR.DIV_TRANSFER_RESTRUCTURE, TR.DIV_TRANSFER], optionsMode: 'suggest' },
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
    // ── 部下の引き継ぎ（部下がいる場合のみ表示）───────────────────────────
    ...SUBORDINATE_TRANSFER_INPUTS,
  ],

  onFieldChange: {
    positionBand: (newBand, ctx, currentValues) => {
      const matrix = ctx.masters.promotionMatrix ?? []
      // band を positionBand と明示的に同期（isRegularEmp チェックをバイパス）
      const base: Partial<AllocationRow> = { band: newBand }
      if (!matrix.length) return { setValues: base }
      const currentJobClass = currentValues?._currentJobClass as string | undefined
      const suggestions = suggestOfficialPositions(newBand, currentJobClass, matrix)
      if (!suggestions.length) return { setValues: base }
      return { setValues: { ...base, officialPositionCode: suggestions[0] } }
    },
    officialPositionCode: (value) => ({ suggestFieldValue: { field: 'localJobTitle', value } }),
  },

  onOpen: (row, ctx) => {
    const matrix = ctx.masters.promotionMatrix ?? []
    const matrixEntry = findMatrixEntry(
      row.positionBand as string | undefined,
      row.officialPositionCode as string | undefined,
      matrix,
    )
    return {
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
      _managerTransferMode:         detectSubordinateMode(row, ctx),
      _currentJobClass:             matrixEntry?.jobClass,
    }
  },

  createCommand(rowId, values) {
    return {
      kind: 'Demotion',
      validate(ctx) {
        if (!ctx.allocationList.find(r => r.rowId === rowId))
          return fail(`行が見つかりません (rowId: ${rowId})`)
        if (!values.positionBand)
          return fail('ポジションバンドは必須です')
        if (!values.demotionReason)
          return fail('降格理由は必須です')
        return ok()
      },
      apply(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)!
        const { _managerTransferMode, _currentJobClass: _jc2, ...cleanValues } = values
        const label = `降格: ${personName(row)}`
        const result = new DirectEditOperation(rowId, cleanValues, label).apply(ctx)
        return applySubordinateTransfer(row, values, result)
      },
    }
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
    { field: 'transferReason', required: false, options: [TR.DIV_TRANSFER_RESTRUCTURE, TR.DIV_TRANSFER], optionsMode: 'suggest' },
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

  createCommand(rowId, values) {
    return {
      kind: 'TitleChange',
      validate(ctx) {
        if (!ctx.allocationList.find(r => r.rowId === rowId))
          return fail(`行が見つかりません (rowId: ${rowId})`)
        return ok()
      },
      apply(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)!
        return new DirectEditOperation(rowId, values, `役職名変更: ${personName(row)}`).apply(ctx)
      },
    }
  },
}

// ── M職P職切替 ───────────────────────────────────────────────────────────────
//
// 昇降格マトリクスがある場合:
//   現在の (positionBand, officialPositionCode) でエントリを特定 → warningLevel・jobClass を取得
//   → 同じ warningLevel で jobClass が異なるエントリを候補に提示
// マトリクスがない場合:
//   promotionDemotionBand（読み替えバンド）が同一の別バンドに切替（従来動作）

import type { AllMasters } from '../../masters/aggregate'

function getMpMatrix(masters: AllMasters): PromotionMatrixEntry[] {
  return masters.promotionMatrix ?? []
}

/** jobClass が管理職（M職）を示すかどうか。'M' / 'M職' / 'Manager' など先頭 M を判定する */
function isManagerJobClass(jobClass: string): boolean {
  return /^M/i.test(jobClass)
}

/**
 * M→P 切替時に部下の扱いを確認する入力フィールド。
 * visibleWhen で `_managerTransferMode` が設定されている場合のみ表示する。
 */
const MP_SWITCH_SUBORDINATE_INPUTS: (SectionDivider | OperationInput)[] = [
  { kind: 'section', label: '部下の扱い' },
  {
    field:       '_managerTransferMode',
    label:       '部下の上司設定',
    required:    false,
    options:     ['引き継ぐ（上司のまま）', '外す（マネージャーから外れる）'],
    optionsMode: 'restrict',
    visibleWhen: (values) => values._managerTransferMode !== undefined,
  },
]

function findMpAlternatives(
  positionBand: string | undefined,
  officialPositionCode: string | undefined,
  matrix: PromotionMatrixEntry[],
): { currentEntry: PromotionMatrixEntry; alternatives: PromotionMatrixEntry[] } | null {
  if (!positionBand || !officialPositionCode || !matrix.length) return null
  const currentEntry = findMatrixEntry(positionBand, officialPositionCode, matrix)
  if (!currentEntry) return null
  const alternatives = matrix.filter(
    e => e.warningLevel === currentEntry.warningLevel && e.jobClass !== currentEntry.jobClass,
  )
  return { currentEntry, alternatives }
}

export const mpTrackSwitchDef: EditOperation = {
  id:          'MpTrackSwitch',
  label:       'M職P職切替',
  group:       'jobClassification',
  badge:       'jobChange',
  description: '給与等級が変わらないM職・P職間の職務区分切替を記入します。現在のバンドと役職名の組み合わせから切替先の候補を自動提案します。',

  availableFor: (row, masters) => {
    if (!row.userId) return unavailable('在席者がいません')
    const positionBand         = row.positionBand         as string | undefined
    const officialPositionCode = row.officialPositionCode as string | undefined
    const matrix = getMpMatrix(masters)

    // M職P職切替マトリクスで候補を検索（優先）
    const found = findMpAlternatives(positionBand, officialPositionCode, matrix)
    if (found) {
      return found.alternatives.length > 0
        ? AVAILABLE
        : unavailable('切替可能なM職P職の組み合わせがマトリクスにありません')
    }

    // フォールバック: promotionDemotionBand
    const currentBand = row.band as string | undefined
    if (!currentBand) return unavailable('在席者がいません')
    const currentEntry = masters.jobLevels.find(e => e.label === currentBand || e.code === currentBand)
    if (!currentEntry?.promotionDemotionBand) return unavailable('切替可能なバンドがありません')
    const siblings = masters.jobLevels.filter(
      e => e.promotionDemotionBand === currentEntry.promotionDemotionBand && e.label !== currentBand,
    )
    return siblings.length > 0 ? AVAILABLE : unavailable('切替可能なバンドがありません')
  },

  // 簡易モード: バンドと役職名だけ入力
  quickInputs: [
    { field: 'band',                 required: true  },
    { field: 'officialPositionCode', required: false },
  ],

  inputs: [
    { field: 'transferReason', required: false, options: [TR.DIV_TRANSFER_RESTRUCTURE, TR.DIV_TRANSFER], optionsMode: 'suggest' },
    { field: 'memo',           required: false },
    { kind: 'section', label: 'バンド切替' },
    {
      field:    'band',
      label:    '切替後バンド',
      required: true,
      options:  (ctx, row) => {
        const positionBand         = row?.positionBand         as string | undefined
        const officialPositionCode = row?.officialPositionCode as string | undefined
        const matrix = getMpMatrix(ctx.masters)

        const found = findMpAlternatives(positionBand, officialPositionCode, matrix)
        if (found) {
          return [...new Set(found.alternatives.map(e => e.jobLevel))]
        }

        // フォールバック
        const currentBand = row?.band as string | undefined
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
    // ── 部下の扱い（M→P 切替かつ部下がいる場合のみ表示）─────────────────────
    ...MP_SWITCH_SUBORDINATE_INPUTS,
  ],

  onFieldChange: {
    band: (newBand, ctx, currentValues) => {
      const matrix = getMpMatrix(ctx.masters)
      if (!matrix.length) return {}
      const currentJobClass     = currentValues?._currentJobClass     as string | undefined
      const currentWarningLevel = Number(currentValues?._currentWarningLevel)
      if (!currentJobClass || isNaN(currentWarningLevel)) return {}

      // 新バンド × 同 warningLevel × 異なる jobClass で役職候補を絞り込む
      const candidates = matrix.filter(
        e => e.jobLevel === newBand
          && e.warningLevel === currentWarningLevel
          && e.jobClass !== currentJobClass,
      )
      if (!candidates.length) return {}
      return { setValues: { officialPositionCode: candidates[0].officialPosition } }
    },
    officialPositionCode: (value) => ({ suggestFieldValue: { field: 'localJobTitle', value } }),
  },

  onOpen: (row, ctx) => {
    const positionBand         = row.positionBand         as string | undefined
    const officialPositionCode = row.officialPositionCode as string | undefined
    const matrix = getMpMatrix(ctx.masters)

    const found = findMpAlternatives(positionBand, officialPositionCode, matrix)
    if (found) {
      const { currentEntry, alternatives } = found
      const altBands  = [...new Set(alternatives.map(e => e.jobLevel))]
      const initBand  = altBands.length === 1 ? altBands[0] : undefined
      const initTitle = initBand
        ? alternatives.filter(e => e.jobLevel === initBand).map(e => e.officialPosition)[0]
        : undefined

      // M→P 切替で部下がいる場合のみ部下セクションを表示（P→M は部下なしが前提のため不要）
      const isCurrentM      = isManagerJobClass(currentEntry.jobClass)
      const hasSubordinates = detectSubordinateMode(row, ctx) !== undefined
      const managerMode     = (isCurrentM && hasSubordinates) ? '引き継ぐ（上司のまま）' : undefined

      return {
        transferReason:        (row.transferReason ?? TR.DIV_TRANSFER) as string | undefined,
        memo:                  (row.memo ?? 'M職P職切替')              as string | undefined,
        band:                  initBand,
        officialPositionCode:  initTitle ?? officialPositionCode,
        localJobTitle:         row.localJobTitle                       as string | undefined,
        _currentJobClass:      currentEntry.jobClass,
        _currentWarningLevel:  String(currentEntry.warningLevel),
        _managerTransferMode:  managerMode,
      }
    }

    // フォールバック: promotionDemotionBand
    const currentBandLabel = row.band as string | undefined
    const currentEntry = currentBandLabel
      ? ctx.masters.jobLevels.find(e => e.label === currentBandLabel || e.code === currentBandLabel)
      : undefined
    const alternatives = currentEntry?.promotionDemotionBand
      ? ctx.masters.jobLevels
          .filter(e => e.promotionDemotionBand === currentEntry.promotionDemotionBand && e.label !== currentBandLabel)
      : []
    return {
      transferReason:       (row.transferReason ?? TR.DIV_TRANSFER) as string | undefined,
      memo:                 (row.memo ?? 'M職P職切替')              as string | undefined,
      band:                 (alternatives.length === 1 ? alternatives[0].label : undefined) as string | undefined,
      officialPositionCode: officialPositionCode,
      localJobTitle:        row.localJobTitle                       as string | undefined,
    }
  },

  createCommand(rowId, values) {
    return {
      kind: 'MpTrackSwitch',
      validate(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)
        if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
        if (!values.band) return fail('切替後のバンドを選択してください')

        const matrix = getMpMatrix(ctx.masters)
        const found  = findMpAlternatives(
          row.positionBand         as string | undefined,
          row.officialPositionCode as string | undefined,
          matrix,
        )
        if (found) {
          const isValid = found.alternatives.some(e => e.jobLevel === values.band)
          if (!isValid) return fail('選択したバンドはM職P職切替の対象外です')
          return ok()
        }

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
      apply(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)!
        const { _managerTransferMode, _currentJobClass: _jc, _currentWarningLevel: _wl, ...cleanValues } = values
        const result = new DirectEditOperation(
          rowId,
          {
            transferReason:       cleanValues.transferReason,
            memo:                 cleanValues.memo,
            band:                 cleanValues.band,
            positionBand:         cleanValues.band,
            officialPositionCode: cleanValues.officialPositionCode,
            localJobTitle:        cleanValues.localJobTitle,
          },
          `M職P職切替: ${personName(row)}`,
        ).apply(ctx)

        if (_managerTransferMode === '外す（マネージャーから外れる）') {
          const posCode = row.positionCode as string | undefined
          if (posCode) {
            const updatedList = result.updatedList.map(r =>
              (r.managerPositionCode as string | undefined) === posCode
                ? { ...r, managerPositionCode: undefined, managerName: undefined }
                : r
            )
            return { ...result, updatedList }
          }
        }
        return result
      },
    }
  },
}

export const DEFS: EditOperation[] = [promotionDef, demotionDef, titleChangeDef, mpTrackSwitchDef]
