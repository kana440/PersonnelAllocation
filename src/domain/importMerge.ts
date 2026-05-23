import type { AllocationRow } from './allocationRow'
import type { Organization }  from './schemas'
import { getDescendantOrgIds } from './orgScope'

export type ImportMode = 'replace-all' | 'scope-replace' | 'append-new'

export interface MergeResult {
  rows:    AllocationRow[]
  added:   number
  kept:    number
  removed: number
}

export function mergeAllocationList(opts: {
  existing:   AllocationRow[]
  incoming:   AllocationRow[]
  mode:       ImportMode
  scopeOrgId: string | null
  afterOrgs:  Organization[]
}): MergeResult {
  const { existing, incoming, mode, scopeOrgId, afterOrgs } = opts
  const maxExistingId = existing.length > 0 ? Math.max(...existing.map(r => r.rowId)) : 0

  if (mode === 'replace-all') {
    const rows = incoming.map((r, i) => ({ ...r, rowId: i + 1 }))
    return { rows, added: rows.length, kept: 0, removed: existing.length }
  }

  if (mode === 'scope-replace') {
    // Keep rows outside scope; replace everything inside scope with incoming rows
    const scopeCodes = buildScopeCodes(scopeOrgId, afterOrgs)

    const outsideRows = scopeCodes
      ? existing.filter(r => !r.departmentCode || !scopeCodes.has(r.departmentCode))
      : []

    let nextId = maxExistingId + 1
    const incomingRows = incoming.map(r => ({ ...r, rowId: nextId++ }))

    return {
      rows:    [...outsideRows, ...incomingRows],
      added:   incomingRows.length,
      kept:    outsideRows.length,
      removed: existing.length - outsideRows.length,
    }
  }

  // append-new: add only rows not already present (by groupEmployeeId + departmentCode)
  const existingKeys = new Set(
    existing
      .filter(r => r.groupEmployeeId)
      .map(r => `${r.groupEmployeeId}|${r.departmentCode ?? ''}`)
  )

  let nextId = maxExistingId + 1
  const rowsToAdd: AllocationRow[] = []
  for (const r of incoming) {
    if (!r.groupEmployeeId) {
      // No key → always add as new
      rowsToAdd.push({ ...r, rowId: nextId++ })
    } else {
      const key = `${r.groupEmployeeId}|${r.departmentCode ?? ''}`
      if (!existingKeys.has(key)) {
        rowsToAdd.push({ ...r, rowId: nextId++ })
      }
    }
  }

  return {
    rows:    [...existing, ...rowsToAdd],
    added:   rowsToAdd.length,
    kept:    existing.length,
    removed: 0,
  }
}

function buildScopeCodes(scopeOrgId: string | null, afterOrgs: Organization[]): Set<string> | null {
  if (!scopeOrgId) return null
  const ids = getDescendantOrgIds(scopeOrgId, afterOrgs)
  return new Set(
    afterOrgs.filter(o => ids.has(o.id) && o.externalCode).map(o => o.externalCode as string)
  )
}
