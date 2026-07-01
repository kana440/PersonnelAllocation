// Re-export from domain/derivation for backward compatibility.
// New code should import directly from '../../domain/derivation'.
export {
  deriveOrgSubFields,
  reDeriveOrgSubFieldsForList,
  deriveManagerName,
  reDeriveManagerNamesForList,
} from '../rules/derive'
