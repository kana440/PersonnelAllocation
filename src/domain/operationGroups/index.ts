// Projection functions are now in domain/projection/rows.ts.
// AfterValues is now in domain/allocationRow.ts.
// This barrel exists only for backward-compat during migration.
export type { AfterValues } from '../allocationRow'
export {
  derivePersons,
  deriveCompanies,
  deriveBeforePositions,
  deriveAfterPositions,
  deriveBeforeAffiliations,
  deriveAfterAffiliations,
} from '../projection/rows'
