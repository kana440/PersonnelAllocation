import type { AllCodeLists }  from '../codeLists/aggregate'
import type { DerivedUpdates } from './types'

/** 給与等級ラベルから数字部分（Level）を抽出する */
function extractLevelNumber(payGrade: string | undefined): number | undefined {
  if (!payGrade) return undefined
  const m = payGrade.match(/\d+/)
  return m ? parseInt(m[0], 10) : undefined
}

/**
 * 給与等級の数字部分（Level）の変化から promotionSign を導出する。
 * Level が上がった → '昇格'、下がった → '降格'、変化なし → undefined。
 */
export function derivePromotionSignFromLevel(
  afterPayGrade: string | undefined,
  prevPayGrade:  string | undefined,
): DerivedUpdates {
  const afterLv = extractLevelNumber(afterPayGrade)
  const prevLv  = extractLevelNumber(prevPayGrade)
  if (afterLv === undefined || prevLv === undefined || afterLv === prevLv) return {}
  return { promotionSign: afterLv > prevLv ? '昇格' : '降格' }
}

function warningLevel(bandLabel: string | undefined, codeLists: AllCodeLists): number {
  if (!bandLabel) return 0
  return codeLists.jobLevels.find(e => e.label === bandLabel)?.promotionDemotionWarningLevel ?? 0
}

/**
 * band の変更から promotionSign を導出する。
 * warningLevel が変化した場合のみ設定（0 → X 、または X → Y の変化）。
 * 実際の文字列値は環境の transferReason 等に依存するため TODO として残す。
 * TODO: promotionSign の実際の値（例: '○'、'昇格'等）を確認して置き換えること。
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
  // TODO: 実際の promotionSign 値は環境依存。現在は方向を示すプレースホルダーを使用。
  return { promotionSign: afterLevel > prevLevel ? '昇格' : '降格' }
}

/**
 * payGrade の変更から payGradeChangeSign を導出する。
 * TODO: 実際の payGradeChangeSign 値は環境依存。現在はプレースホルダーを使用。
 */
export function derivePayGradeChangeSign(
  afterPayGrade: string | undefined,
  prevPayGrade:  string | undefined,
): DerivedUpdates {
  if (!afterPayGrade || afterPayGrade === prevPayGrade) {
    return { payGradeChangeSign: undefined }
  }
  // TODO: 実際の payGradeChangeSign 値は環境依存。
  return { payGradeChangeSign: '変更' }
}
