import type { AllocationRow } from '../../allocationRow'
import type { EditPatternMeta } from './types'
import type { DetectContext } from '../detection/helpers'
import { isNoCheckReason, compareBandLevels } from '../detection/helpers'
import { TR } from '../../transferReasonLabels'

// ── 分類型 ──────────────────────────────────────────────────────────────────
// ここに列挙されたパターンは互いに排他。classifyBandTitle() が唯一の判定ソース。

type BandTitleKind =
  | 'promotion'             // 本人バンド UP
  | 'promotionPositionOnly' // 本人バンド比較不可、ポジションバンド UP
  | 'demotion'              // 本人バンド DOWN
  | 'demotionPositionOnly'  // 本人バンド比較不可、ポジションバンド DOWN
  | 'bandChange'            // 本人バンド変化、比較不可（方向不明）
  | 'bandChangePositionOnly'// ポジションバンドのみ変化、比較不可
  | 'mpTrackSwitch'         // 本人バンド変化、同ワーニングLv（M職↔P職等）
  | 'titleChange'           // フリータイトルのみ変化
  | null                    // 変化なし or isNoCheckReason で一致なし

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
    if (dir === 'up')   return 'promotionPositionOnly'
    if (dir === 'down') return 'demotionPositionOnly'
    return 'bandChangePositionOnly'
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
  meta: Omit<EditPatternMeta, 'label' | 'addLabel' | 'editLabel' | 'detect'>,
): EditPatternMeta {
  return { label, addLabel: label, editLabel: label, ...meta, detect: (row, ctx) => classifyBandTitle(row, ctx) === kind }
}

export const JOB_CLASSIFICATION_META: Partial<Record<string, EditPatternMeta>> = {
  promotion:              s('promotion',              '昇格',               { badge: 'positive',  group: 'jobClassification' }),
  promotionPositionOnly:  s('promotionPositionOnly',  '昇格(Posのみ)',      { badge: 'positive',  group: 'jobClassification' }),
  demotion:               s('demotion',               '降格',               { badge: 'negative',  group: 'jobClassification' }),
  demotionPositionOnly:   s('demotionPositionOnly',   '降格(Posのみ)',      { badge: 'negative',  group: 'jobClassification' }),
  bandChange:             s('bandChange',             'バンド変更',          { badge: 'jobChange', group: 'jobClassification' }),
  bandChangePositionOnly: s('bandChangePositionOnly', 'バンド変更(Posのみ)', { badge: 'jobChange', group: 'jobClassification' }),
  titleChange:            s('titleChange',   '役職名のみ変更', { badge: 'jobChange', group: 'jobClassification', menuLabel: '役職名のみ変更' }),
  mpTrackSwitch:          s('mpTrackSwitch', 'M職P職切替', { badge: 'jobChange', group: 'jobClassification', menuLabel: 'M職P職切替' }),

  jobTypeChange: {
    label: 'ジョブタイプ変更', addLabel: 'ジョブタイプ変更', editLabel: 'ジョブタイプ変更',
    menuLabel: '職種変更',
    badge: 'jobChange', group: 'jobClassification',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return false
      const prevFamily = row.prevJobFamily as string | undefined
      const afterFamily = row.jobFamily    as string | undefined
      const prevType   = row.prevJobType   as string | undefined
      const afterType  = row.jobType       as string | undefined
      return (
        (!!prevFamily && !!afterFamily && prevFamily !== afterFamily) ||
        (!!prevType   && !!afterType   && prevType   !== afterType)
      )
    },
  },

  payGradeChange: {
    label: '給与等級変更', addLabel: '給与等級変更', editLabel: '給与等級変更',
    badge: 'jobChange', group: 'jobClassification',
    detect: (row, _ctx) => {
      const prev  = row.prevPayGrade as string | undefined
      const after = row.payGrade     as string | undefined
      return !!prev && !!after && prev !== after
    },
  },

  secondmentAcceptanceModeSwitch: {
    label: '本務兼務切替（出向受入）', addLabel: '本務兼務切替（出向受入）', editLabel: '本務兼務切替（出向受入）',
    badge: 'jobChange', group: 'jobClassification',
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
    badge: 'jobChange', group: 'jobClassification',
    detect: (row, _ctx) => {
      const tr = row.transferReason as string | undefined
      return tr === TR.EMPLOYMENT_EXTENSION || tr === TR.EMPLOYMENT_EXTENSION_PROCEDURE
    },
  },

  employmentTypeChange: {
    label: '雇用タイプ変更', addLabel: '雇用タイプ変更', editLabel: '雇用タイプ変更',
    badge: 'jobChange', group: 'jobClassification',
    detect: (row, ctx) => {
      if ((row.transferReason as string | undefined) !== TR.EMPLOYMENT_TYPE_CHANGE_PROCEDURE) return false
      if (isNoCheckReason(row, ctx)) return true
      const prevEt  = row.prevEmploymentType as string | undefined
      const afterEt = row.employmentType     as string | undefined
      return !!prevEt && !!afterEt && prevEt !== afterEt
    },
  },
}
