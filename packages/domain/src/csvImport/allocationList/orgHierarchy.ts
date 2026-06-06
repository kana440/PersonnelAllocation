import { z } from 'zod'
import type { Organization } from '../../schemas'

// Derived (not persisted) — built by traversing Organization.parentId upward from a leaf org.
// Appears twice in AllocationList context: once for "after" state, once for "before" state,
// each with its own effectiveDate (the org assignment dates differ between the two).
export const OrgHierarchySchema = z.object({
  departmentCode: z.string(),            // Organization.externalCode of the leaf org
  businessUnit:   z.string().optional(), // ancestor at level 1
  division:       z.string().optional(), // ancestor at level 2
  subDivision:    z.string().optional(), // ancestor at level 3
  group:          z.string().optional(), // ancestor at level 4
  team:           z.string().optional(), // ancestor at level 5
  effectiveDate:  z.string(),            // YYYY-MM-DD — basis date for this org assignment
})

export type OrgHierarchy = z.infer<typeof OrgHierarchySchema>

// ── Utility: build OrgHierarchy from Organization master ────────────────────

const LEVEL_FIELD: Record<number, keyof Omit<OrgHierarchy, 'departmentCode' | 'effectiveDate'>> = {
  1: 'businessUnit',
  2: 'division',
  3: 'subDivision',
  4: 'group',
  5: 'team',
}

export function resolveOrgHierarchy(
  orgId: string,
  orgs: Organization[],
  effectiveDate: string,
): OrgHierarchy | null {
  const leaf = orgs.find(o => o.id === orgId)
  if (!leaf) return null

  // Collect the full ancestor chain (leaf → root)
  const chain: Organization[] = []
  let current: Organization | undefined = leaf
  while (current) {
    chain.push(current)
    current = current.parentId ? orgs.find(o => o.id === current!.parentId) : undefined
  }

  const result: Partial<OrgHierarchy> = {
    departmentCode: leaf.externalCode ?? leaf.id,
    effectiveDate,
  }

  for (const org of chain) {
    const field = LEVEL_FIELD[org.level]
    if (field) result[field] = org.name
  }

  return OrgHierarchySchema.parse(result)
}
