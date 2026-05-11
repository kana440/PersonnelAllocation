import type { Affiliation, Operation, Position, Organization } from './schemas'
import { operationRegistry } from './operations'

export type AfterState = { affiliations: Affiliation[]; positions: Position[]; organizations: Organization[] }

export function applyOperations(
  beforeAffiliations: Affiliation[],
  beforePositions:    Position[],
  operations:         Operation[],
  organizations:      Organization[],
): AfterState {
  const state = {
    affiliations:  beforeAffiliations.map(a => ({ ...a })),
    positions:     beforePositions.map(p => ({ ...p })),
    organizations: organizations.map(o => ({ ...o })),
  }

  for (const op of [...operations].sort((a, b) => a.order - b.order)) {
    operationRegistry.get(op.kind)?.apply(state, op)
  }

  return state
}
