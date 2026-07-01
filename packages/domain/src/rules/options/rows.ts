import type { AllocationRow } from '../../allocationRow'
import type { Person, Organization } from '../../schemas'

// externalCode と id の両方をキーにした組織検索 Map を構築する。
export function buildOrgMap(orgs: Organization[]): Map<string, Organization> {
  const map = new Map<string, Organization>()
  for (const o of orgs) {
    if (o.externalCode) map.set(o.externalCode, o)
    map.set(o.id, o)
  }
  return map
}

// ── Person ────────────────────────────────────────────────────────────────────

export function derivePersons(rows: AllocationRow[]): Person[] {
  const seen = new Set<string>()
  const persons: Person[] = []
  for (const row of rows) {
    const key = row.userId
    if (!key || seen.has(key)) continue
    seen.add(key)
    persons.push({
      id:              `p_${key}`,
      name:            [row.lastName, row.firstName].filter(Boolean).join(' ') || key,
      sfPersonId:      key,
      employeeNumber:  row.employeeNumber,
      groupEmployeeId: row.groupEmployeeId,
    })
  }
  return persons
}
