// マスタデータのクロスリファレンス整合性チェック
// 警告メッセージを返すだけ（副作用なし）。呼び出し側がUIに表示する。
import type { AllMasters }    from './aggregate'
import type { OrgMasterEntry }  from './orgMaster'
import { buildOrgHierarchy }    from './orgHierarchy'

export interface MasterWarning {
  category: 'A' | 'B'
  message:  string
  detail:   Record<string, unknown>
}

// ── カテゴリ A: マスタ間の外部キー整合 ───────────────────────────────────────

function checkA1_promotionDemotionBandInPayGrades(ms: AllMasters): MasterWarning[] {
  const payGradeBands = new Set(ms.payGrades.map(e => e.band).filter(Boolean) as string[])
  return ms.jobLevels
    .filter(jl => jl.promotionDemotionBand && !payGradeBands.has(jl.promotionDemotionBand))
    .map(jl => ({
      category: 'A' as const,
      message:  `jobLevels "${jl.label}" の昇降格判定バンド "${jl.promotionDemotionBand}" が payGrades.band に存在しません`,
      detail:   { jobLevel: jl.label, promotionDemotionBand: jl.promotionDemotionBand },
    }))
}

function checkA2_compensationCategoryInPayGrades(ms: AllMasters): MasterWarning[] {
  const payGradeCompCats = new Set(ms.payGrades.map(e => e.compensationCategory).filter(Boolean) as string[])
  return ms.jobTypes
    .filter(jt => jt.compensationCategory && !payGradeCompCats.has(jt.compensationCategory))
    .map(jt => ({
      category: 'A' as const,
      message:  `jobTypes "${jt.label}" の報酬区分 "${jt.compensationCategory}" が payGrades.compensationCategory に存在しません`,
      detail:   { jobType: jt.label, compensationCategory: jt.compensationCategory },
    }))
}

function checkA3_jobTypeFamilyCode(ms: AllMasters): MasterWarning[] {
  if (ms.jobFamilies.length === 0) return []
  const familyCodes = new Set(ms.jobFamilies.map(jf => jf.code))
  return ms.jobTypes
    .filter(jt => jt.jobFamilyCode && !familyCodes.has(jt.jobFamilyCode))
    .map(jt => ({
      category: 'A' as const,
      message:  `jobTypes "${jt.label}" の職種コード "${jt.jobFamilyCode}" が jobFamilies に存在しません（孤立したJobType）`,
      detail:   { jobType: jt.label, jobFamilyCode: jt.jobFamilyCode },
    }))
}

function checkA4_orgMasterCompanyCode(ms: AllMasters): MasterWarning[] {
  if (ms.companyFilters.length === 0 || ms.orgMasterEntries.length === 0) return []
  const filterCodes = new Set(ms.companyFilters.map(cf => cf.code))
  const missing = new Map<string, string>()
  for (const org of ms.orgMasterEntries) {
    if (org.companyCode && !filterCodes.has(org.companyCode) && !missing.has(org.companyCode)) {
      missing.set(org.companyCode, org.name ?? org.code)
    }
  }
  return [...missing.entries()].map(([companyCode, orgName]) => ({
    category: 'A' as const,
    message:  `組織マスタ（例: "${orgName}"）の会社コード "${companyCode}" が companyFilters に存在しません`,
    detail:   { companyCode, exampleOrg: orgName },
  }))
}

function checkA5_orgMasterParentCode(ms: AllMasters): MasterWarning[] {
  if (ms.orgMasterEntries.length === 0) return []

  const phaseLabel = (p: string) => p === 'after' ? '新' : '旧'
  const warnings: MasterWarning[] = []

  // phase ごとに buildOrgHierarchy を 1 回呼んで hierarchy を取得
  const byPhase = new Map<string, OrgMasterEntry[]>()
  for (const org of ms.orgMasterEntries) {
    if (!byPhase.has(org.phase)) byPhase.set(org.phase, [])
    byPhase.get(org.phase)!.push(org)
  }

  for (const [phase, entries] of byPhase) {
    const { hierarchy } = buildOrgHierarchy(entries)
    const seen = new Set<string>()
    for (const org of entries) {
      if (!org.parentCode) continue
      const derived = hierarchy.get(org.code)?.parentId ?? null
      if (derived === org.parentCode) continue
      if (seen.has(org.code)) continue
      seen.add(org.code)
      warnings.push({
        category: 'A',
        message:  `組織マスタ（${phaseLabel(phase)}）"${org.name ?? org.code}" の上位組織コード "${org.parentCode}" が、階層パスから導出した親 "${derived ?? 'なし'}" と一致しません`,
        detail:   { phase: phaseLabel(phase), code: org.code, parentCode: org.parentCode, derivedParent: derived },
      })
    }
  }
  return warnings
}

function checkA6_orgMasterWorkLocation(ms: AllMasters): MasterWarning[] {
  if (ms.workLocations.length === 0 || ms.orgMasterEntries.length === 0) return []
  const locationLabels = new Set(ms.workLocations.map(wl => wl.label))
  const missing = new Map<string, string>()
  for (const org of ms.orgMasterEntries) {
    if (org.workLocation && !locationLabels.has(org.workLocation) && !missing.has(org.workLocation)) {
      missing.set(org.workLocation, org.name ?? org.code)
    }
  }
  return [...missing.entries()].map(([workLocation, orgName]) => ({
    category: 'A' as const,
    message:  `組織マスタ（例: "${orgName}"）の勤務地 "${workLocation}" が workLocations に存在しません`,
    detail:   { workLocation, exampleOrg: orgName },
  }))
}

// ── カテゴリ B: 給与等級の導出完結性 ─────────────────────────────────────────

function checkB1_payGradeDuplication(ms: AllMasters): MasterWarning[] {
  const counts = new Map<string, number>()
  for (const pg of ms.payGrades) {
    if (!pg.band || !pg.compensationCategory) continue
    const key = `${pg.compensationCategory}||${pg.band}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => {
      const [compensationCategory, band] = key.split('||')
      return {
        category: 'B' as const,
        message:  `payGrades に (報酬区分="${compensationCategory}", バンド="${band}") の重複が ${count} 件あります。給与等級の自動導出が不確定になります`,
        detail:   { compensationCategory, band, count },
      }
    })
}

function checkB2_payGradeCoverage(ms: AllMasters): MasterWarning[] {
  const payGradeSet = new Set(
    ms.payGrades
      .filter(p => p.compensationCategory && p.band)
      .map(p => `${p.compensationCategory}||${p.band}`)
  )
  const warnings: MasterWarning[] = []
  const seen = new Set<string>()
  for (const jt of ms.jobTypes) {
    if (!jt.compensationCategory) continue
    for (const jl of ms.jobLevels) {
      const gradingBand = jl.promotionDemotionBand
      if (!gradingBand) continue
      const key = `${jt.compensationCategory}||${gradingBand}`
      if (!payGradeSet.has(key) && !seen.has(key)) {
        seen.add(key)
        warnings.push({
          category: 'B',
          message:  `jobType "${jt.label}"（報酬区分="${jt.compensationCategory}"）× jobLevel "${jl.label}"（バンド="${gradingBand}"）に対応する payGrade が存在しません。給与等級が自動導出されません`,
          detail:   { jobType: jt.label, compensationCategory: jt.compensationCategory, jobLevel: jl.label, gradingBand },
        })
      }
    }
  }
  return warnings
}

// ── エントリポイント ──────────────────────────────────────────────────────────

export function validateMastersIntegrity(ms: AllMasters): MasterWarning[] {
  return [
    ...checkA1_promotionDemotionBandInPayGrades(ms),
    ...checkA2_compensationCategoryInPayGrades(ms),
    ...checkA3_jobTypeFamilyCode(ms),
    ...checkA4_orgMasterCompanyCode(ms),
    ...checkA5_orgMasterParentCode(ms),
    ...checkA6_orgMasterWorkLocation(ms),
    ...checkB1_payGradeDuplication(ms),
    ...checkB2_payGradeCoverage(ms),
  ]
}
