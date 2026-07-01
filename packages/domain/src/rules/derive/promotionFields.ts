import type { AllMasters }  from '../../masters/aggregate'
import type { DerivedUpdates } from './types'

/**
 * 2つのバンド間の昇降格ステップ差を返す（warningLevel の差）。
 * 正 = 昇格方向、負 = 降格方向、undefined = どちらかのバンドが不明。
 */
export function computeBandStepDiff(
  fromBand: string | undefined,
  toBand:   string | undefined,
  masters: AllMasters,
): number | undefined {
  if (!fromBand || !toBand || fromBand === toBand) return undefined
  const fromLevel = masters.jobLevels.find(e => e.label === fromBand)?.promotionDemotionWarningLevel
  const toLevel   = masters.jobLevels.find(e => e.label === toBand)?.promotionDemotionWarningLevel
  if (!fromLevel || !toLevel) return undefined
  return toLevel - fromLevel
}

/**
 * 現在バンドから指定ステップ数だけ上/下にあるバンドラベル一覧を返す。
 * steps=1 なら「1段上のバンドのみ」、steps=2 なら「1〜2段上」。
 */
export function getBandsByStep(
  currentBand: string | undefined,
  steps:       number,
  direction:   'up' | 'down',
  masters:   AllMasters,
): string[] {
  if (!currentBand) return []
  const baseLevel = masters.jobLevels.find(e => e.label === currentBand)?.promotionDemotionWarningLevel
  if (!baseLevel) return []
  return masters.jobLevels
    .filter(e => {
      if (!e.promotionDemotionWarningLevel) return false
      const diff = e.promotionDemotionWarningLevel - baseLevel
      return direction === 'up'
        ? diff >= 1 && diff <= steps
        : diff <= -1 && diff >= -steps
    })
    .map(e => e.label)
}

/** 給与等級ラベルから数字部分（Level）を抽出する */
function extractLevelNumber(payGrade: string | undefined): number | undefined {
  if (!payGrade) return undefined
  const m = payGrade.match(/\d+/)
  return m ? parseInt(m[0], 10) : undefined
}

/**
 * 給与等級の数字部分（Level）の変化から promotionSign を導出する。
 * Level が変化した場合のみ '1' をセット。変化なし → undefined。
 */
export function derivePromotionSignFromLevel(
  afterPayGrade: string | undefined,
  prevPayGrade:  string | undefined,
): DerivedUpdates {
  const afterLv = extractLevelNumber(afterPayGrade)
  const prevLv  = extractLevelNumber(prevPayGrade)
  if (afterLv === undefined || prevLv === undefined || afterLv === prevLv) return {}
  return { promotionSign: '1' }
}

function warningLevel(bandLabel: string | undefined, masters: AllMasters): number {
  if (!bandLabel) return 0
  return masters.jobLevels.find(e => e.label === bandLabel)?.promotionDemotionWarningLevel ?? 0
}

/**
 * band の変更から promotionSign を導出する。
 * warningLevel が変化した場合のみ '1' をセット（0 → X 、または X → Y の変化）。
 */
export function derivePromotionSign(
  afterBand: string | undefined,
  prevBand:  string | undefined,
  masters: AllMasters,
): DerivedUpdates {
  const afterLevel = warningLevel(afterBand, masters)
  const prevLevel  = warningLevel(prevBand,  masters)

  if (afterLevel === 0 || prevLevel === 0 || afterLevel === prevLevel) {
    return { promotionSign: undefined }
  }
  return { promotionSign: '1' }
}

/**
 * payGrade の変更から payGradeChangeSign を導出する。
 * 変更があった場合のみ '1' をセット。
 */
export function derivePayGradeChangeSign(
  afterPayGrade: string | undefined,
  prevPayGrade:  string | undefined,
): DerivedUpdates {
  if (!afterPayGrade || afterPayGrade === prevPayGrade) {
    return { payGradeChangeSign: undefined }
  }
  return { payGradeChangeSign: '1' }
}
