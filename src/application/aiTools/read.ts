import type { HRApplicationService } from '../HRApplicationService'
import type { AllocationRow } from '../../domain/allocationRow'
import type { Person, Organization } from '../../domain/schemas'
import { detectChanges } from '../../domain/patterns/changeDetection'
import { validateRow } from '../../domain/validation/validateRow'
import { getFieldOptions as getFieldOptionsFromDomain } from '../../domain/choices'
import type { OrgTreeNode, SelectedRowContext } from '../aiTypes'
import type { PersonSearchResult, VacantPositionResult } from './types'
import { buildOrgTree } from './orgTree'

export function createReadMethods(service: HRApplicationService) {

  function findPersons(query: {
    name?:    string
    userId?:  string
    orgCode?: string
  }): PersonSearchResult[] {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    const byUserId = new Map<string, AllocationRow[]>()
    for (const row of allocationList) {
      if (!row.userId) continue
      const bucket = byUserId.get(row.userId) ?? []
      bucket.push(row)
      byUserId.set(row.userId, bucket)
    }
    const results: PersonSearchResult[] = []
    for (const [userId, rows] of byUserId) {
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      const name    = [primary.lastName, primary.firstName].filter(Boolean).join(' ')
      if (query.name    && !name.includes(query.name))              continue
      if (query.userId  && !userId.includes(query.userId))           continue
      if (query.orgCode && primary.departmentCode !== query.orgCode) continue
      const org = afterOrganizations.find(
        o => o.externalCode === primary.departmentCode || o.id === primary.departmentCode
      )
      results.push({ userId, name, orgCode: primary.departmentCode ?? '', orgName: org?.name, rowIds: rows.map(r => r.rowId) })
    }
    return results
  }

  function findOrgs(query: { name?: string; code?: string; company?: string }): Organization[] {
    const { afterOrganizations } = service.getSnapshot()
    return afterOrganizations.filter(o => {
      if (query.name    && !o.name.includes(query.name))                  return false
      if (query.code    && !(o.externalCode ?? o.id).includes(query.code)) return false
      if (query.company && o.companyId !== query.company)                  return false
      return true
    })
  }

  function getPersonRows(userId: string): AllocationRow[] {
    return service.getSnapshot().allocationList.filter(r => r.userId === userId)
  }

  function getRow(rowId: number): AllocationRow | undefined {
    return service.getSnapshot().allocationList.find(r => r.rowId === rowId)
  }

  function getOrgs():    Organization[] { return service.getSnapshot().afterOrganizations }
  function getPersons(): Person[]       { return service.getSnapshot().persons }

  /** 選択行のコンテキスト情報を返す。buildSystemPrompt に渡すために使う。 */
  function getRowContext(rowId: number): SelectedRowContext | null {
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return null
    const name   = [row.lastName, row.firstName].filter(Boolean).join(' ') || `行 ${rowId}`
    const org    = afterOrganizations.find(o => (o.externalCode ?? o.id) === row.departmentCode)
    const issues = validateRow({ row, afterOrganizations, codeLists, allocationList, changes: detectChanges(row) })
    return {
      rowId,
      name,
      orgName: org?.name ?? row.departmentCode ?? '',
      issues: issues.map(i => ({ field: String(i.field), level: i.level, message: i.message })),
    }
  }

  /**
   * 指定行の現在の状態に基づき、フィールドの有効な選択肢を返す。
   * VALUE_RULES の条件付きルールが自動適用される。自己修復時の値確認に使う。
   */
  function getFieldOptions(rowId: number, field: string): string[] {
    const snap = service.getSnapshot()
    const row  = snap.allocationList.find(r => r.rowId === rowId)
    if (!row) return []
    return getFieldOptionsFromDomain(field, row, snap.codeLists, row.jobFamily as string | undefined)
  }

  function findVacantPositions(query: { orgCode?: string } = {}): VacantPositionResult[] {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    return allocationList
      .filter(r => !r.userId && !!r.positionCode)
      .filter(r => !query.orgCode || r.departmentCode === query.orgCode)
      .map(r => {
        const org = afterOrganizations.find(o => (o.externalCode ?? o.id) === r.departmentCode)
        return {
          rowId:         r.rowId,
          positionCode:  r.positionCode!,
          orgCode:       r.departmentCode ?? '',
          orgName:       org?.name,
          localJobTitle: r.localJobTitle ?? '',
        }
      })
  }

  function getPersonDetail(userId: string): Array<{
    rowId:          number
    name:           string
    concurrentType: string | undefined
    before: { departmentCode: string | undefined; orgName: string | undefined; grade: string | undefined; position: string | undefined }
    after:  { departmentCode: string | undefined; orgName: string | undefined; grade: string | undefined; position: string | undefined }
    promotionSign?:       string
    managerPositionCode?: string
    positionCode?:        string
  }> {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    const rows = allocationList.filter(r => r.userId === userId)
    return rows.map(r => {
      const orgName     = afterOrganizations.find(o => (o.externalCode ?? o.id) === r.departmentCode)?.name
      const prevOrgName = afterOrganizations.find(o => (o.externalCode ?? o.id) === r.prevDepartmentCode)?.name
      return {
        rowId:          r.rowId,
        name:           [r.lastName, r.firstName].filter(Boolean).join(' '),
        concurrentType: r.concurrentType ?? r.prevConcurrentType,
        before: {
          departmentCode: r.prevDepartmentCode,
          orgName:        prevOrgName ?? r.prevDepartmentCode,
          grade:          r.prevPayGrade,
          position:       r.prevOfficialPositionCode,
        },
        after: {
          departmentCode: r.departmentCode,
          orgName:        orgName ?? r.departmentCode,
          grade:          r.payGrade || r.prevPayGrade,
          position:       r.officialPositionCode || r.prevOfficialPositionCode,
        },
        promotionSign:       r.promotionSign       || undefined,
        managerPositionCode: r.managerPositionCode || undefined,
        positionCode:        r.positionCode        || undefined,
      }
    })
  }

  function listChangedRows(): Array<{
    rowId:    number
    userId:   string | undefined
    name:     string
    orgName:  string
    grade:    { before: string | undefined; after: string | undefined } | null
    position: { before: string | undefined; after: string | undefined } | null
  }> {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    return allocationList
      .filter(r => r.operationGroupId)
      .map(r => {
        const orgName = afterOrganizations.find(
          o => (o.externalCode ?? o.id) === r.departmentCode
        )?.name ?? r.departmentCode
        return {
          rowId:    r.rowId,
          userId:   r.userId,
          name:     [r.lastName, r.firstName].filter(Boolean).join(' '),
          orgName:  orgName ?? '',
          grade:    r.prevPayGrade !== r.payGrade
            ? { before: r.prevPayGrade, after: r.payGrade } : null,
          position: r.prevOfficialPositionCode !== r.officialPositionCode
            ? { before: r.prevOfficialPositionCode, after: r.officialPositionCode } : null,
        }
      })
  }

  /** 組織ツリーデータを返す。ChatWidget の組み立ては toolRegistry 側で行う。 */
  function getOrgTreeData(rootOrgCode?: string): {
    ok: true; orgName: string; tree: OrgTreeNode; totalMembers: number
  } | { ok: false; error: string } {
    const { afterOrganizations } = service.getSnapshot()
    const allPersons = findPersons({})

    const rootOrg = rootOrgCode
      ? afterOrganizations.find(o => o.externalCode === rootOrgCode || o.id === rootOrgCode)
      : afterOrganizations.find(o => !o.parentId && !o.isAbandoned)

    if (!rootOrg) return {
      ok: false,
      error: rootOrgCode ? `組織コード "${rootOrgCode}" が見つかりません` : '組織データがありません',
    }

    const tree = buildOrgTree(rootOrg, afterOrganizations, allPersons)

    function countTotal(node: OrgTreeNode): number {
      return node.members.length + node.children.reduce((s, c) => s + countTotal(c), 0)
    }

    return { ok: true, orgName: rootOrg.name, tree, totalMembers: countTotal(tree) }
  }

  return {
    findPersons, findOrgs, getPersonRows, getRow, getOrgs, getPersons,
    getRowContext, getFieldOptions, findVacantPositions,
    getPersonDetail, listChangedRows, getOrgTreeData,
  }
}
