import type { AllocationRow } from '../../allocationRow'
import type { EditPatternMeta } from './types'
import type { DetectContext } from '../detection/helpers'
import { isNoCheckReason, compareBandLevels } from '../detection/helpers'
import { TR } from '../../transferReasonLabels'

// ── 分類型 ──────────────────────────────────────────────────────────────────
// ここに列挙されたパターンは互いに排他。classifyBandTitle() が唯一の判定ソース。

type BandTitleKind =
  | 'promotion'    // バンド UP（本人バンドまたはポジションバンドで判定）
  | 'demotion'     // バンド DOWN（本人バンドまたはポジションバンドで判定）
  | 'bandChange'   // バンド変化、マスタ不備等で昇降格方向が判定不能
  | 'mpTrackSwitch'// 本人バンド変化、同ワーニングLv（M職↔P職等）
  | 'titleChange'  // フリータイトルのみ変化
  | null           // 変化なし or isNoCheckReason で一致なし

// ── ヘルパー ─────────────────────────────────────────────────────────────────

function isMpTrackSwitchChange(row: AllocationRow, ctx: DetectContext): boolean {
  const prevBand  = (row.prevBand as string | undefined) ?? ''
  const afterBand = (row.band    as string | undefined) ?? ''
  if (!prevBand || !afterBand || prevBand === afterBand) return false
  const jlByLabel  = new Map(ctx.masters.jobLevels.map(e => [e.label, e]))
  const prevEntry  = jlByLabel.get(prevBand)
  const afterEntry = jlByLabel.get(afterBand)
  if (!prevEntry?.promotionDemotionBand || !afterEntry?.promotionDemotionBand) return false
  return prevEntry.promotionDemotionBand === afterEntry.promotionDemotionBand
}

// ── 単一分類関数 ─────────────────────────────────────────────────────────────
// 排他性はこの関数の構造で保証する。各パターンの detect() はここに委譲するだけ。

function classifyBandTitle(row: AllocationRow, ctx: DetectContext): BandTitleKind {
  if (isNoCheckReason(row, ctx)) {
    const tr = row.transferReason as string | undefined
    if (tr === TR.PROMOTION)    return 'promotion'
    if (tr === TR.DEMOTION)     return 'demotion'
    if (tr === TR.TITLE_CHANGE) return 'titleChange'
    return null
  }

  // ① 本人バンドが変化した（両方に値がある場合のみ比較）
  const prevBand  = row.prevBand as string | undefined
  const afterBand = row.band     as string | undefined
  if (prevBand && afterBand && prevBand !== afterBand) {
    const dir = compareBandLevels(prevBand, afterBand, ctx)
    if (dir === 'up')   return 'promotion'
    if (dir === 'down') return 'demotion'
    if (dir === 'same') return isMpTrackSwitchChange(row, ctx) ? 'mpTrackSwitch' : 'titleChange'
    return 'bandChange'
  }

  // ② ポジションバンドのみ変化（両方に値がある場合のみ比較）
  const prevPosBand  = row.prevPositionBand as string | undefined
  const afterPosBand = row.positionBand     as string | undefined
  if (prevPosBand && afterPosBand && prevPosBand !== afterPosBand) {
    const dir = compareBandLevels(prevPosBand, afterPosBand, ctx)
    if (dir === 'up')   return 'promotion'
    if (dir === 'down') return 'demotion'
    return 'bandChange'
  }

  // ③ フリータイトルのみ変化（両方に値がある場合のみ比較）
  const prevTitle  = row.prevLocalJobTitle as string | undefined
  const afterTitle = row.localJobTitle     as string | undefined
  if (prevTitle && afterTitle && prevTitle !== afterTitle) return 'titleChange'

  return null
}

// ── メタ定義 ─────────────────────────────────────────────────────────────────

function s(
  kind: BandTitleKind,
  label: string,
  chipLabel: string,
  meta: Omit<EditPatternMeta, 'label' | 'addLabel' | 'editLabel' | 'chipLabel' | 'detect'>,
): EditPatternMeta {
  return { label, addLabel: label, editLabel: label, chipLabel, ...meta, detect: (row, ctx) => classifyBandTitle(row, ctx) === kind }
}

export const JOB_CLASSIFICATION_META: Partial<Record<string, EditPatternMeta>> = {
  promotion:              s('promotion',    '昇格',            '昇格',         { badge: 'positive',  group: 'jobClassification', defaultVisible: true,  description: '本人バンドまたはポジションバンドが前期より上昇。masters.jobLevels の promotionDemotionWarningLevel で方向を判定。' }),
  demotion:               s('demotion',    '降格',             '降格',         { badge: 'negative',  group: 'jobClassification', defaultVisible: true,  description: '本人バンドまたはポジションバンドが前期より低下。promotionDemotionWarningLevel で方向を判定。' }),
  bandChange:             s('bandChange',  'バンド変更(昇降格不明)', 'Band変(昇降不明)', { badge: 'jobChange', group: 'jobClassification', defaultVisible: false, description: 'バンド（本人またはポジション）が変化したが、マスタにレベル情報がなく昇降格の方向が判定不能。' }),
  titleChange:            s('titleChange', '役職名のみ変更',  '役職名のみ変', { badge: 'jobChange', group: 'jobClassification', defaultVisible: false, menuLabel: '役職名のみ変更', description: 'フリータイトル（localJobTitle）のみ変化。またはnoCheckRequired行で「役職名変更」事由。' }),
  mpTrackSwitch:          s('mpTrackSwitch', 'M職P職切替',    'M/P職替',      { badge: 'jobChange', group: 'jobClassification', defaultVisible: false, menuLabel: 'M職P職切替',   description: 'バンド変化あり、promotionDemotionBand が同一（M職↔P職など昇降格なしの横移動）。' }),

  jobFamilyChange: {
    label: 'ジョブファミリー変更', addLabel: 'ジョブファミリー変更', editLabel: 'ジョブファミリー変更',
    chipLabel: 'JF変',
    description: 'ジョブファミリー（jobFamily）が変化。JF変化時は JT変 より優先して表示。noCheckRequired 行は対象外。',
    menuLabel: 'ジョブファミリー変更',
    badge: 'jobChange', group: 'jobClassification', defaultVisible: false,
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return false
      const prevFamily  = row.prevJobFamily as string | undefined
      const afterFamily = row.jobFamily     as string | undefined
      return !!prevFamily && !!afterFamily && prevFamily !== afterFamily
    },
  },

  jobTypeChange: {
    label: 'ジョブタイプ変更', addLabel: 'ジョブタイプ変更', editLabel: 'ジョブタイプ変更',
    chipLabel: 'JT変',
    description: 'ジョブタイプ（jobType）が変化し、ジョブファミリーは変化なし。ファミリーも変化した場合は JF変更 を優先。noCheckRequired 行は対象外。',
    menuLabel: '職種変更',
    badge: 'jobChange', group: 'jobClassification', defaultVisible: false,
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return false
      const prevFamily  = row.prevJobFamily as string | undefined
      const afterFamily = row.jobFamily     as string | undefined
      if (prevFamily && afterFamily && prevFamily !== afterFamily) return false  // JF変化は jobFamilyChange に任せる
      const prevType  = row.prevJobType as string | undefined
      const afterType = row.jobType    as string | undefined
      return !!prevType && !!afterType && prevType !== afterType
    },
  },

  payGradeChange: {
    label: '給与等級変更', addLabel: '給与等級変更', editLabel: '給変',
    chipLabel: '給与変更',
    description: '給与等級（payGrade）フィールドが変化。',
    badge: 'jobChange', group: 'jobClassification', defaultVisible: false,
    detect: (row, _ctx) => {
      const prev  = row.prevPayGrade as string | undefined
      const after = row.payGrade     as string | undefined
      return !!prev && !!after && prev !== after
    },
  },

  secondmentAcceptanceModeSwitch: {
    label: '本務兼務切替（出向受入）', addLabel: '本務兼務切替（出向受入）', editLabel: '本務兼務切替（出向受入）',
    chipLabel: '本兼切替(出向)',
    description: '異動事由が「出向受入本務兼務切替」で、isSecondmentAcceptance=true の雇用タイプ間の本務↔兼務の切替。',
    badge: 'jobChange', group: 'jobClassification', defaultVisible: false,
    detect: (row, ctx) => {
      if ((row.transferReason as string | undefined) !== TR.SECONDMENT_ACCEPTANCE_MODE_SWITCH) return false
      if (isNoCheckReason(row, ctx)) return true
      const prevEt  = row.prevEmploymentType as string | undefined
      const afterEt = row.employmentType     as string | undefined
      if (!prevEt || !afterEt || prevEt === afterEt) return false
      const etByLabel = new Map(ctx.masters.employmentTypes.map(e => [e.label, e]))
      return !!(etByLabel.get(prevEt)?.isSecondmentAcceptance && etByLabel.get(afterEt)?.isSecondmentAcceptance)
    },
  },

  employmentExtension: {
    label: '雇用延長', addLabel: '雇用延長', editLabel: '雇用延長',
    chipLabel: '雇延',
    description: '異動事由が「雇用延長」または「雇用延長手続」。',
    badge: 'jobChange', group: 'jobClassification', defaultVisible: true,
    detect: (row, _ctx) => {
      const tr = row.transferReason as string | undefined
      return tr === TR.EMPLOYMENT_EXTENSION || tr === TR.EMPLOYMENT_EXTENSION_PROCEDURE
    },
  },

  employmentTypeChange: {
    label: '雇用タイプ変更', addLabel: '雇用タイプ変更', editLabel: '雇用タイプ変更',
    chipLabel: '雇T変',
    description: '異動事由が「雇用タイプ変更手続」かつ雇用タイプ（employmentType）が変化。noCheckRequired 行は事由のみで判定。',
    badge: 'jobChange', group: 'jobClassification', defaultVisible: false,
    detect: (row, ctx) => {
      if ((row.transferReason as string | undefined) !== TR.EMPLOYMENT_TYPE_CHANGE_PROCEDURE) return false
      if (isNoCheckReason(row, ctx)) return true
      const prevEt  = row.prevEmploymentType as string | undefined
      const afterEt = row.employmentType     as string | undefined
      return !!prevEt && !!afterEt && prevEt !== afterEt
    },
  },
}
