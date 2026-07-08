import { useMemo } from 'react'
import { buildOrgMap } from '@personnel/domain/rules/options/rows'
import type { Organization, Person } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import type { PositionEntry, MemberEntry } from '../OrgViewContext'
import { detectPatterns, type DetectContext } from '@personnel/domain/patterns/detection'
import { validateRow } from '@personnel/domain/rules/validate/validateRow'
import { RowRuleCtx } from '@personnel/domain/rules/rowRule'
import { buildPositionDepthList, makeRowComparator } from '../panel/helpers'
import { isAbsenceRow } from '../FloatingAbsencePanel/helpers'
import { isSlowPerf } from '../../../utils/perfLog'

interface UseOrgViewDataDeps {
  allAfterOrgs:        Organization[]
  beforeOrganizations: Organization[]
  persons:             Person[]
  allocationList:      AllocationRow[]
  masters:             AllMasters
  orgMapping:          Map<string, string[]>
}

export function useOrgViewData({ allAfterOrgs, beforeOrganizations, persons, allocationList, masters, orgMapping }: UseOrgViewDataDeps) {
  const afterOrgByCode = useMemo(() => buildOrgMap(allAfterOrgs), [allAfterOrgs])
  const personBySfId   = useMemo(() => new Map(persons.map(p => [p.sfPersonId ?? '', p])), [persons])

  // "${beforeCode}|${afterCode}" のペア集合。orgRestructure / 昇降格検出に使用
  const sameOrgPairs = useMemo((): Set<string> => {
    const beforeCodeById = new Map(beforeOrganizations.filter(o => o.externalCode).map(o => [o.id, o.externalCode!]))
    const afterCodeById  = new Map(allAfterOrgs.filter(o => o.externalCode).map(o => [o.id, o.externalCode!]))
    const pairs = new Set<string>()
    for (const [beforeId, afterIds] of orgMapping) {
      const beforeCode = beforeCodeById.get(beforeId)
      if (!beforeCode) continue
      for (const afterId of afterIds) {
        const afterCode = afterCodeById.get(afterId)
        if (afterCode) pairs.add(`${beforeCode}|${afterCode}`)
      }
    }
    return pairs
  }, [beforeOrganizations, allAfterOrgs, orgMapping])

  const detectCtx = useMemo((): DetectContext => ({
    allocationList,
    afterOrganizations: allAfterOrgs,
    masters,
    sameOrgPairs,
  }), [allocationList, allAfterOrgs, masters, sameOrgPairs])

  const afterMembersByOrgId = useMemo(() => {
    const map = new Map<string, MemberEntry[]>()
    for (const row of allocationList) {
      if (!row.departmentCode) continue
      if (isAbsenceRow(row)) continue
      const org    = afterOrgByCode.get(row.departmentCode)
      if (!org) continue
      const person = personBySfId.get(row.userId ?? '')
      if (!person) continue
      const arr = map.get(org.id)
      if (arr) arr.push({ row, person })
      else map.set(org.id, [{ row, person }])
    }
    return map
  }, [allocationList, afterOrgByCode, personBySfId])

  const afterOrgRowsById = useMemo(() => {
    const map = new Map<string, AllocationRow[]>()
    for (const row of allocationList) {
      if (!row.departmentCode) continue
      if (isAbsenceRow(row)) continue
      const org = afterOrgByCode.get(row.departmentCode)
      if (!org) continue
      const arr = map.get(org.id)
      if (arr) arr.push(row)
      else map.set(org.id, [row])
    }
    return map
  }, [allocationList, afterOrgByCode])

  const rowComparator = useMemo(() => makeRowComparator(masters), [masters])

  // RowRuleCtx: lazy getter（orgById・orgByCode 等）のコストを全行で共有するため、
  // positionTreeByOrgId のループ全体で 1 インスタンスだけ生成する（batchValidate.ts と同じパターン）。
  const rowRuleCtx = useMemo(() => new RowRuleCtx(masters, allAfterOrgs), [masters, allAfterOrgs])

  // 全行の positionCode セット（クロスOrg 上司判定用）
  const allPositionCodes = useMemo(() => {
    const s = new Set<string>()
    for (const row of allocationList) { if (row.positionCode) s.add(row.positionCode) }
    return s
  }, [allocationList])

  const positionTreeByOrgId = useMemo((): Map<string, PositionEntry[]> => {
    const t0 = performance.now()
    const result = new Map<string, PositionEntry[]>()
    for (const [orgId, rows] of afterOrgRowsById) {
      // 同一 org 内の positionCode セット（外部上司判定用）
      const inOrgCodes = new Set<string>()
      for (const row of rows) { if (row.positionCode) inOrgCodes.add(row.positionCode) }

      // 同一階層内をバンド降順→氏名五十音順でソートしてから深さリストを構築
      const sortedRows = [...rows].sort(rowComparator)
      const depthList  = buildPositionDepthList(sortedRows, r => r.positionCode, r => r.managerPositionCode)
      result.set(orgId, depthList.map(({ row, depth }) => {
        const mgrCode = row.managerPositionCode
        let externalManagerKind: 'cross-org' | 'missing' | undefined
        if (mgrCode && !inOrgCodes.has(mgrCode)) {
          externalManagerKind = allPositionCodes.has(mgrCode) ? 'cross-org' : 'missing'
        }
        const detection = detectPatterns(row, detectCtx)
        return {
          row,
          depth,
          person:           row.userId ? (personBySfId.get(row.userId) ?? null) : null,
          activePatterns:   detection.patterns,
          validationIssues: validateRow({
            row,
            afterOrganizations: detectCtx.afterOrganizations,
            masters:            detectCtx.masters,
            allocationList:     [],
            changes:            detection,
            rowRuleCtx,
          }),
          externalManagerKind,
        }
      }))
    }
    const elapsed = performance.now() - t0
    if (isSlowPerf(elapsed)) {
      // eslint-disable-next-line no-console
      console.log(`[perf] positionTreeByOrgId build: ${elapsed.toFixed(1)}ms (${allocationList.length} rows, ${afterOrgRowsById.size} orgs)`)
    }
    return result
  }, [afterOrgRowsById, personBySfId, rowComparator, allPositionCodes, detectCtx, rowRuleCtx, allocationList.length])

  return { afterOrgByCode, personBySfId, afterMembersByOrgId, positionTreeByOrgId }
}
