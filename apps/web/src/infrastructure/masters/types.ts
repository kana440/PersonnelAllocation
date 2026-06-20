// Re-export from domain so existing infrastructure imports don't break.
// AllMasters and EMPTY_MASTERS live in domain/masters/aggregate.ts.
export type { AllMasters } from '@personnel/domain/masters/aggregate'
export { EMPTY_MASTERS } from '@personnel/domain/masters/aggregate'
