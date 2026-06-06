import type { AllCodeLists }  from '../masters/aggregate'
import type { DerivedUpdates } from './types'

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

function warningLevel(bandLabel: string | undefined, codeLists: AllCodeLists): number {
  if (!bandLabel) return 0
  return codeLists.jobLevels.find(e => e.label === bandLabel)?.promotionDemotionWarningLevel ?? 0
}

/**
 * band の変更から promotionSign を導出する。
 * warningLevel が変化した場合のみ '1' をセット（0 → X 、または X → Y の変化）。
 */
export function derivePromotionSign(
  afterBand: string | undefined,
  prevBand:  string | undefined,
  codeLists: AllCodeLists,
): DerivedUpdates {
  const afterLevel = warningLevel(afterBand, codeLists)
  const prevLevel  = warningLevel(prevBand,  codeLists)

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
