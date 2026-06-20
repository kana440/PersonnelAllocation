// マスタデータのクロスリファレンス整合性チェック
// 警告メッセージを返すだけ（副作用なし）。呼び出し側がUIに表示する。
import type { AllCodeLists } from './aggregate'

export interface CodeListWarning {
  category: 'A' | 'B'
  message:  string
  detail:   Record<string, unknown>
}

// ── カテゴリ A: マスタ間の外部キー整合 ───────────────────────────────────────

function checkA1_promotionDemotionBandInPayGrades(cl: AllCodeLists): CodeListWarning[] {
  const payGradeBands = new Set(cl.payGrades.map(e => e.band).filter(Boolean) as string[])
  return cl.jobLevels
    .filter(jl => jl.promotionDemotionBand && !payGradeBands.has(jl.promotionDemotionBand))
    .map(jl => ({
      category: 'A' as const,
      message:  `jobLevels "${jl.label}" の昇降格判定バンド "${jl.promotionDemotionBand}" が payGrades.band に存在しません`,
      detail:   { jobLevel: jl.label, promotionDemotionBand: jl.promotionDemotionBand },
    }))
}

function checkA2_compensationCategoryInPayGrades(cl: AllCodeLists): CodeListWarning[] {
  const payGradeCompCats = new Set(cl.payGrades.map(e => e.compensationCategory).filter(Boolean) as string[])
  return cl.jobTypes
    .filter(jt => jt.compensationCategory && !payGradeCompCats.has(jt.compensationCategory))
    .map(jt => ({
      category: 'A' as const,
      message:  `jobTypes "${jt.label}" の報酬区分 "${jt.compensationCategory}" が payGrades.compensationCategory に存在しません`,
      detail:   { jobType: jt.label, compensationCategory: jt.compensationCategory },
    }))
}

function checkA3_jobTypeFamilyCode(cl: AllCodeLists): CodeListWarning[] {
  if (cl.jobFamilies.length === 0) return []
  const familyCodes = new Set(cl.jobFamilies.map(jf => jf.code))
  return cl.jobTypes
    .filter(jt => jt.jobFamilyCode && !familyCodes.has(jt.jobFamilyCode))
    .map(jt => ({
      category: 'A' as const,
      message:  `jobTypes "${jt.label}" の職種コード "${jt.jobFamilyCode}" が jobFamilies に存在しません（孤立したJobType）`,
      detail:   { jobType: jt.label, jobFamilyCode: jt.jobFamilyCode },
    }))
}

function checkA4_orgMasterCompanyCode(cl: AllCodeLists): CodeListWarning[] {
  if (cl.companyFilters.length === 0 || cl.orgMasterEntries.length === 0) return []
  const filterCodes = new Set(cl.companyFilters.map(cf => cf.code))
  const missing = new Map<string, string>()
  for (const org of cl.orgMasterEntries) {
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

function checkA5_orgMasterParentCode(cl: AllCodeLists): CodeListWarning[] {
  if (cl.orgMasterEntries.length === 0) return []
  const byPhase = new Map<string, Set<string>>()
  for (const org of cl.orgMasterEntries) {
    if (!byPhase.has(org.phase)) byPhase.set(org.phase, new Set())
    byPhase.get(org.phase)!.add(org.code)
  }
  const warnings: CodeListWarning[] = []
  const seen = new Set<string>()
  for (const org of cl.orgMasterEntries) {
    if (!org.parentCode) continue
    const codes = byPhase.get(org.phase)
    if (codes && !codes.has(org.parentCode)) {
      const key = `${org.phase}:${org.parentCode}`
      if (!seen.has(key)) {
        seen.add(key)
        warnings.push({
          category: 'A',
          message:  `組織マスタ（${org.phase === 'after' ? '新' : '旧'}）の親組織コード "${org.parentCode}" が同フェーズに存在しません`,
          detail:   { phase: org.phase === 'after' ? '新' : '旧', parentCode: org.parentCode, exampleOrg: org.name ?? org.code },
        })
      }
    }
  }
  return warnings
}

function checkA6_orgMasterWorkLocation(cl: AllCodeLists): CodeListWarning[] {
  if (cl.workLocations.length === 0 || cl.orgMasterEntries.length === 0) return []
  const locationLabels = new Set(cl.workLocations.map(wl => wl.label))
  const missing = new Map<string, string>()
  for (const org of cl.orgMasterEntries) {
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

function checkB1_payGradeDuplication(cl: AllCodeLists): CodeListWarning[] {
  const counts = new Map<string, number>()
  for (const pg of cl.payGrades) {
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

function checkB2_payGradeCoverage(cl: AllCodeLists): CodeListWarning[] {
  const payGradeSet = new Set(
    cl.payGrades
      .filter(p => p.compensationCategory && p.band)
      .map(p => `${p.compensationCategory}||${p.band}`)
  )
  const warnings: CodeListWarning[] = []
  const seen = new Set<string>()
  for (const jt of cl.jobTypes) {
    if (!jt.compensationCategory) continue
    for (const jl of cl.jobLevels) {
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

export function validateCodeListsIntegrity(cl: AllCodeLists): CodeListWarning[] {
  return [
    ...checkA1_promotionDemotionBandInPayGrades(cl),
    ...checkA2_compensationCategoryInPayGrades(cl),
    ...checkA3_jobTypeFamilyCode(cl),
    ...checkA4_orgMasterCompanyCode(cl),
    ...checkA5_orgMasterParentCode(cl),
    ...checkA6_orgMasterWorkLocation(cl),
    ...checkB1_payGradeDuplication(cl),
    ...checkB2_payGradeCoverage(cl),
  ]
}
