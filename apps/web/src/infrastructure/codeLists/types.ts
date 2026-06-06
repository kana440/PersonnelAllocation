// Re-export from domain so existing infrastructure imports don't break.
// AllCodeLists and EMPTY_CODE_LISTS live in domain/masters/aggregate.ts.
export type { AllCodeLists } from '@personnel/domain/masters/aggregate'
export { EMPTY_CODE_LISTS } from '@personnel/domain/masters/aggregate'
