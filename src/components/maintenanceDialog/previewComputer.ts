import type { AllocationRow }  from '../../domain/allocationRow'
import type { Organization }   from '../../domain/schemas'
import type { AllCodeLists }   from '../../domain/codeLists/aggregate'
import { reDeriveManagerNamesForList, reDeriveOrgSubFieldsForList } from '../../domain/operation/orgHelpers'
import type { PersonChange, OrgPreview } from './types'

// ── helpers ──────────────────────────────────────────────────────────────────

function orgNameFor(departmentCode: string | undefined, orgs: Organization[]): string {
  if (!departmentCode) return ''
  return orgs.find(o => (o.externalCode ?? o.id) === departmentCode)?.name ?? departmentCode
}

// ── per-operation preview computers ──────────────────────────────────────────

export function computeManagerNameChanges(
  allocationList: AllocationRow[],
  afterOrganizations: Organization[],
): PersonChange[] {
  const updated = reDeriveManagerNamesForList(allocationList)
  const result: PersonChange[] = []
  for (let i = 0; i < allocationList.length; i++) {
    const row  = allocationList[i]
    const next = updated[i]
    if (row === next) continue
    result.push({
      rowId:          row.rowId,
      userId:         row.userId ?? '',
      name:           [row.lastName, row.firstName].filter(Boolean).join(' ') || String(row.positionCode ?? ''),
      departmentCode: row.departmentCode ?? '',
      orgName:        orgNameFor(row.departmentCode, afterOrganizations),
      changes: [{
        field:  'managerName',
        label:  '上司姓名',
        before: String(row.managerName ?? ''),
        after:  String(next.managerName ?? ''),
      }],
    })
  }
  return result
}

export function computeOrgSubFieldChanges(
  allocationList: AllocationRow[],
  afterOrganizations: Organization[],
  codeLists: AllCodeLists,
): PersonChange[] {
  const updated = reDeriveOrgSubFieldsForList(allocationList, codeLists)
  const ORG_FIELD_LABELS: Record<string, string> = {
    businessUnit: 'ビジネスユニット',
    division:     '事業部',
    subDivision:  '部',
    group:        'グループ',
    team:         'チーム',
  }
  const result: PersonChange[] = []
  for (let i = 0; i < allocationList.length; i++) {
    const row  = allocationList[i]
    const next = updated[i]
    if (row === next) continue
    const changes = Object.entries(ORG_FIELD_LABELS).flatMap(([field, label]) => {
      const before = String(row[field as keyof AllocationRow] ?? '')
      const after  = String(next[field as keyof AllocationRow] ?? '')
      if (before === after) return []
      return [{ field, label, before, after }]
    })
    if (changes.length === 0) continue
    result.push({
      rowId:          row.rowId,
      userId:         row.userId ?? '',
      name:           [row.lastName, row.firstName].filter(Boolean).join(' ') || String(row.positionCode ?? ''),
      departmentCode: row.departmentCode ?? '',
      orgName:        orgNameFor(row.departmentCode, afterOrganizations),
      changes,
    })
  }
  return result
}

// ── merge + group ─────────────────────────────────────────────────────────────

/** 複数操作の変更を rowId ごとにマージする */
export function mergePersonChanges(batches: PersonChange[][]): PersonChange[] {
  const byRowId = new Map<number, PersonChange>()
  for (const batch of batches) {
    for (const change of batch) {
      const existing = byRowId.get(change.rowId)
      if (existing) {
        existing.changes.push(...change.changes)
      } else {
        byRowId.set(change.rowId, { ...change, changes: [...change.changes] })
      }
    }
  }
  return Array.from(byRowId.values())
}

/** 変更リストを組織ごとにグループ化する */
export function groupByOrg(
  changes: PersonChange[],
  allocationList: AllocationRow[],
  afterOrganizations: Organization[],
): OrgPreview[] {
  const orgMap   = new Map<string, Organization>()
  for (const o of afterOrganizations) {
    const key = o.externalCode ?? o.id
    orgMap.set(key, o)
    orgMap.set(o.id, o)
  }

  // Count total members per orgCode
  const totalByCode = new Map<string, number>()
  for (const row of allocationList) {
    if (!row.departmentCode || !row.userId) continue
    totalByCode.set(row.departmentCode, (totalByCode.get(row.departmentCode) ?? 0) + 1)
  }

  const grouped = new Map<string, PersonChange[]>()
  for (const change of changes) {
    const code = change.departmentCode || '__none__'
    const arr  = grouped.get(code) ?? []
    arr.push(change)
    grouped.set(code, arr)
  }

  return Array.from(grouped.entries())
    .map(([code, affected]) => {
      const org = orgMap.get(code)
      return {
        orgId:        org?.id        ?? code,
        orgCode:      code,
        orgName:      org?.name      ?? code,
        totalMembers: totalByCode.get(code) ?? 0,
        affected:     affected.sort((a, b) => a.name.localeCompare(b.name, 'ja')),
      }
    })
    .sort((a, b) => a.orgName.localeCompare(b.orgName, 'ja'))
}
