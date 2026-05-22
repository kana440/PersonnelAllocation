import { delay } from './delay'
import type { ReportLineMember } from '../../../components/ai/types'
import type { AllocationRow } from '../../../domain/allocationRow'
import type { Organization } from '../../../domain/schemas'

export function buildReportLineMembers(
  targetRows: AllocationRow[],
  allRows: AllocationRow[],
  allOrgs: Organization[],
): ReportLineMember[] {
  // Collect position codes for the target person (may have multiple rows for concurrent assignments)
  const targetPositionCodes = new Set(
    targetRows.map(r => r.positionCode).filter((c): c is string => Boolean(c))
  )
  if (targetPositionCodes.size === 0) return []

  const targetOrgCodes = new Set(
    targetRows.map(r => r.departmentCode).filter((c): c is string => Boolean(c))
  )

  // Direct reports = rows whose managerPositionCode points at the target
  const reportRows = allRows.filter(
    r => r.managerPositionCode && targetPositionCodes.has(r.managerPositionCode)
  )

  const seen = new Set<string>()
  const members: ReportLineMember[] = []
  for (const row of reportRows) {
    if (!row.userId || seen.has(row.userId)) continue
    seen.add(row.userId)
    const org  = allOrgs.find(o => (o.externalCode ?? o.id) === row.departmentCode)
    const name = [row.lastName, row.firstName].filter(Boolean).join(' ')
    members.push({
      userId:    row.userId,
      name:      name || row.userId,
      orgName:   org?.name ?? row.departmentCode ?? '',
      isSameOrg: targetOrgCodes.has(row.departmentCode ?? ''),
      position:  row.prevOfficialPositionCode,
      grade:     row.prevPayGrade,
    })
  }
  return members
}

export const reportLineScenario = {
  async promptMessage(): Promise<string> {
    await delay(600)
    return 'レポートラインを確認したい方の名前を入力してください。'
  },

  async searchMessage(
    inputName: string,
    result: { managerName: string; managerOrgName: string; members: ReportLineMember[] } | null,
  ): Promise<
    | { text: string; managerName: string; managerOrgName: string; members: ReportLineMember[] }
    | { text: string }
  > {
    await delay(1200)
    if (!result) {
      return { text: `「${inputName}」に一致する方が見つかりませんでした。別の名前で試してください。` }
    }
    if (result.members.length === 0) {
      return { text: `${result.managerName} さんの直属レポートメンバーは現在登録されていません。（positionCode が設定されていない可能性があります）` }
    }
    const crossCount = result.members.filter(m => !m.isSameOrg).length
    const text = crossCount > 0
      ? `${result.managerName} さんの直属レポート ${result.members.length} 名（うち他組織 ${crossCount} 名）です。`
      : `${result.managerName} さんの直属レポート ${result.members.length} 名です。`
    return { text, ...result }
  },
}
