import type { AllocationRow } from '../../allocationRow'
import type { EditPatternMeta } from './types'
import type { DetectContext } from '../detection/helpers'
import { isNoCheckReason, parseBandLevel } from '../detection/helpers'
import { C_GREEN, C_BLUE, C_RED, isOutsource } from './_shared'

// band / positionBand の前後を比較して昇格・降格・役職変更を判定するヘルパー
function detectBandChangeKind(row: AllocationRow, ctx: DetectContext): 'promotion' | 'demotion' | 'titleChange' | null {
  const bandChanged    = (row.prevBand         ?? '') !== (row.band         ?? '')
  const posBandChanged = (row.prevPositionBand ?? '') !== (row.positionBand ?? '')
  if (!bandChanged && !posBandChanged) return null

  const prevLevel  = parseBandLevel(row.prevBand as string | undefined)
  const afterLevel = parseBandLevel(row.band as string | undefined)

  if (bandChanged && prevLevel !== null && afterLevel !== null) {
    if (afterLevel > prevLevel) return 'promotion'
    if (afterLevel < prevLevel) return 'demotion'
    return 'titleChange'
  }

  if (posBandChanged) {
    const jlwm = new Map(ctx.codeLists.jobLevels.map(e => [e.code, e.promotionDemotionWarningLevel]))
    const prev  = jlwm.get(row.prevPositionBand ?? '')
    const after = jlwm.get(row.positionBand     ?? '')
    if (prev !== undefined && after !== undefined) {
      if (after > prev) return 'promotion'
      if (after < prev) return 'demotion'
      return 'titleChange'
    }
    return 'titleChange'
  }

  return 'titleChange'
}

export const JOB_CLASSIFICATION_META: Partial<Record<string, EditPatternMeta>> = {
  promotion: {
    label: '昇格', addLabel: '昇格', editLabel: '昇格',
    badgeColor: C_GREEN, group: 'jobClassification',
    availableFor: (row, cl) => !isOutsource(row, cl),
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '昇格'
      return detectBandChangeKind(row, ctx) === 'promotion'
    },
  },
  demotion: {
    label: '降格', addLabel: '降格', editLabel: '降格',
    badgeColor: C_RED, group: 'jobClassification',
    availableFor: (row, cl) => !isOutsource(row, cl),
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '降格'
      return detectBandChangeKind(row, ctx) === 'demotion'
    },
  },
  titleChange: {
    label: '役職変更（昇降格なし）', addLabel: '役職変更', editLabel: '役職変更',
    menuLabel: '役職変更',
    badgeColor: C_BLUE, group: 'jobClassification',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '役職変更'
      const bandResult = detectBandChangeKind(row, ctx)
      if (bandResult === 'titleChange') return true
      // band 変化なしで localJobTitle のみ変更
      if (bandResult === null && (row.localJobTitle ?? '') !== (row.prevLocalJobTitle ?? '')) return true
      return false
    },
  },
  jobTypeChange: {
    label: 'ジョブタイプ変更', addLabel: 'ジョブタイプ変更', editLabel: 'ジョブタイプ変更',
    menuLabel: '職種変更',
    badgeColor: C_BLUE, group: 'jobClassification',
    availableFor: (row, cl) => !isOutsource(row, cl),
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return false
      return (
        (row.jobFamily ?? '') !== (row.prevJobFamily ?? '') ||
        (row.jobType   ?? '') !== (row.prevJobType   ?? '')
      )
    },
  },
  employmentExtension: {
    label: '雇用延長', addLabel: '雇用延長', editLabel: '雇用延長',
    badgeColor: C_BLUE, group: 'jobClassification',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '雇用延長'
      const prevEt  = (row.prevEmploymentType as string | undefined) ?? ''
      const afterEt = (row.employmentType     as string | undefined) ?? ''
      return !!(
        prevEt && afterEt && prevEt !== afterEt &&
        (row.departmentCode ?? '') === (row.prevDepartmentCode ?? '')
      )
    },
  },
  employmentTypeChange: {
    label: '雇用タイプ変更', addLabel: '雇用タイプ変更', editLabel: '雇用タイプ変更',
    badgeColor: C_BLUE, group: 'jobClassification',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) {
        const reason = (row.transferReason as string | undefined) ?? ''
        return reason.includes('従業員区分変更')
      }
      const prevEt  = (row.prevEmploymentType as string | undefined) ?? ''
      const afterEt = (row.employmentType     as string | undefined) ?? ''
      // band が変化しない雇用タイプ変更（雇用延長は band を空欄化するので除外される）
      return !!(
        prevEt && afterEt && prevEt !== afterEt &&
        (row.band ?? '') === (row.prevBand ?? '')
      )
    },
  },
}
