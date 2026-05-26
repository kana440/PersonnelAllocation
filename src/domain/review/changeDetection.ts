import type { AllocationRow } from '../allocationRow'

// バンド文字列から数値レベルを抽出（例: "M4" → 4, "G3" → 3, "4" → 4）
export function parseBandLevel(band: string | undefined | null): number | null {
  if (!band) return null
  const m = band.trim().match(/(\d+)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return isNaN(n) ? null : n
}

// ポジションバンド範囲から [min, max] を抽出（例: "M4-M6" → [4, 6], "M4" → [4, 4]）
export function parsePositionBandRange(positionBand: string | undefined | null): [number, number] | null {
  if (!positionBand) return null
  const parts = positionBand.trim().split(/[-~]/)
  const nums = parts.map(p => parseBandLevel(p)).filter((n): n is number => n !== null)
  if (nums.length === 0) return null
  return [Math.min(...nums), Math.max(...nums)]
}

export type ChangeKind =
  | 'transfer'       // 組織変更
  | 'promotion'      // 昇格（bandレベル上昇）
  | 'demotion'       // 降格（bandレベル下降）
  | 'bandChange'     // バンド変更（昇降格以外）
  | 'titleChange'    // 職位名変更
  | 'positionChange' // ポジション変更
  | 'newHire'        // 新規採用（prevUserId なし、userId あり）
  | 'termination'    // 退職（userId なし）
  | 'concurrent'     // 兼務

export interface RowChanges {
  kinds:        Set<ChangeKind>
  bandMismatch: boolean  // band が positionBand 範囲外
  diffCount:    number   // 変更フィールド数
}

/**
 * sameOrgPairs: Set of "${beforeExternalCode}|${afterExternalCode}" strings.
 * If a person moves between orgs listed here, it is NOT treated as a transfer —
 * the orgs are considered the same organisation under a different name/code.
 *
 * jobLevelWarningMap: positionBand code → promotionDemotionWarningLevel (from codeLists.jobLevels).
 * When provided, promotion/demotion is determined by comparing the warning levels of
 * prevPositionBand and positionBand. Without it, falls back to parseBandLevel on band/prevBand.
 */
export function detectChanges(
  row: AllocationRow,
  sameOrgPairs?: Set<string>,
  jobLevelWarningMap?: Map<string, number>,
): RowChanges {
  const kinds = new Set<ChangeKind>()

  const prevCode  = row.prevDepartmentCode ?? ''
  const afterCode = row.departmentCode ?? ''
  const deptChanged = prevCode !== afterCode

  // 対応組織かチェック（ユーザー定義マッピングで same org 扱いにされた組織間）
  const isCorrespondingOrg =
    !deptChanged ||
    (sameOrgPairs !== undefined && sameOrgPairs.has(`${prevCode}|${afterCode}`))

  // 組織変更: 対応関係にない org への移動のみ transfer とする
  if (deptChanged && !isCorrespondingOrg) {
    kinds.add('transfer')
  }

  // バンド変更（昇格・降格・バンド変更）
  // positionBand の promotionDemotionWarningLevel（codeList）で判定する。
  // map が渡されていない・コードが見つからない場合は bandChange として扱う。
  const prevBandStr  = row.prevPositionBand ?? ''
  const afterBandStr = row.positionBand ?? ''
  const afterBandLevel = parseBandLevel(row.band) // bandMismatch チェック用

  if (prevBandStr !== afterBandStr) {
    if (jobLevelWarningMap && prevBandStr && afterBandStr) {
      const prevLevel  = jobLevelWarningMap.get(prevBandStr)
      const afterLevel = jobLevelWarningMap.get(afterBandStr)
      if (prevLevel !== undefined && afterLevel !== undefined) {
        if (afterLevel > prevLevel)      kinds.add('promotion')
        else if (afterLevel < prevLevel) kinds.add('demotion')
        else                             kinds.add('bandChange')
      } else {
        kinds.add('bandChange')
      }
    } else {
      kinds.add('bandChange')
    }
  }

  // 職位名変更
  if ((row.localJobTitle ?? '') !== (row.prevLocalJobTitle ?? '')) {
    kinds.add('titleChange')
  }

  // ポジション変更
  if ((row.positionCode ?? '') !== (row.prevPositionCode ?? '')) {
    kinds.add('positionChange')
  }

  // 新規採用（before に userId がなく after にある）
  if (!row.prevDepartmentCode && row.userId) {
    kinds.add('newHire')
  }

  // 退職（userId がない）
  if (row.prevDepartmentCode && !row.userId && !row.departmentCode) {
    kinds.add('termination')
  }

  // 兼務
  if (row.concurrentType === '兼務') {
    kinds.add('concurrent')
  }

  // band が positionBand 範囲外かチェック
  let bandMismatch = false
  if (afterBandLevel !== null) {
    const range = parsePositionBandRange(row.positionBand)
    if (range) {
      bandMismatch = afterBandLevel < range[0] || afterBandLevel > range[1]
    }
  }

  // 変更フィールド数（簡易: 主要フィールドのみ）
  const keyPairs: Array<[keyof AllocationRow, keyof AllocationRow]> = [
    ['departmentCode', 'prevDepartmentCode'],
    ['band', 'prevBand'],
    ['localJobTitle', 'prevLocalJobTitle'],
    ['positionCode', 'prevPositionCode'],
    ['positionBand', 'prevPositionBand'],
    ['concurrentType', 'prevConcurrentType'],
    ['employmentType', 'prevEmploymentType'],
  ]
  let diffCount = 0
  for (const [after, before] of keyPairs) {
    if ((row[after] ?? '') !== (row[before] ?? '')) diffCount++
  }

  return { kinds, bandMismatch, diffCount }
}
