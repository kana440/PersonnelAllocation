// Re-export from domain so existing infrastructure imports don't break.
// AllCodeLists and EMPTY_CODE_LISTS live in domain/codeLists/aggregate.ts.
export type { AllCodeLists } from '../../domain/codeLists/aggregate'
export { EMPTY_CODE_LISTS } from '../../domain/codeLists/aggregate'
